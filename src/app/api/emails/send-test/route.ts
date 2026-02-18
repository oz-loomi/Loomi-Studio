import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import nodemailer from 'nodemailer';

interface SendTestBody {
  to: string;
  subject?: string;
  html: string;
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await req.json()) as SendTestBody;
    const to = body.to?.trim();
    const subject = body.subject?.trim() || 'Test Email from Loomi Studio';
    const html = body.html;

    if (!to) {
      return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
    }
    if (!html) {
      return NextResponse.json({ error: 'Email HTML content is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients = to.split(',').map((e) => e.trim()).filter(Boolean);
    for (const email of recipients) {
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: `Invalid email address: ${email}` }, { status: 400 });
      }
    }

    // Support multiple SMTP providers via environment variables
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        {
          error: 'Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env.local file.',
          hint: 'For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=you@gmail.com, SMTP_PASS=your-app-password',
        },
        { status: 400 },
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: recipients.join(', '),
      subject: `[TEST] ${subject}`,
      html,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      recipients: recipients.length,
    });
  } catch (err: any) {
    console.error('Send test email error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to send test email' },
      { status: 500 },
    );
  }
}
