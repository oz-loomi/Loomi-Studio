/**
 * Default starter templates for new email template creation.
 *
 * Visual (Drag & Drop): Rich multi-component Maizzle template
 * Code (HTML): Custom email-safe HTML starter for direct editing
 */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Rich component-based starter for visual (Drag & Drop) mode */
function visualStarter(title: string) {
  return `---
title: ${title}
rooftop: preview
---

<x-base>

  <x-core.header />

  <x-core.hero
    headline="Your Headline Goes Here"
    subheadline="Add a brief description that captures your audience's attention and encourages them to keep reading."
    fallback-bg="#1a1a2e"
    headline-color="#ffffff"
    subheadline-color="#e0e0e0"
    hero-height="420px"
    text-align="center"
    content-valign="middle"
    primary-button-text="Get Started"
    primary-button-url="#"
    primary-button-bg-color="#4f46e5"
    primary-button-text-color="#ffffff"
    primary-button-radius="8px"
  />

  <x-core.spacer size="40" />

  <x-core.copy
    greeting="Hi {{contact.first_name}},"
    body="Thank you for being a valued member of our community. We're excited to share some updates with you."
    align="center"
    padding="20px 40px"
  />

  <x-core.spacer size="24" />

  <x-core.features
    section-title="What We Offer"
    feature1="Quality Service"
    feature1-desc="We pride ourselves on delivering exceptional quality in everything we do."
    feature2="Expert Team"
    feature2-desc="Our experienced team is here to help you achieve your goals."
    feature3="Fast Results"
    feature3-desc="Get the results you need quickly and efficiently."
    variant="icon"
    accent-color="#4f46e5"
    padding="20px 40px"
  />

  <x-core.spacer size="24" />

  <x-core.cta
    button-text="Learn More"
    button-url="#"
    button-bg-color="#4f46e5"
    button-text-color="#ffffff"
    button-radius="8px"
    section-padding="20px 40px"
    align="center"
  />

  <x-core.spacer size="40" />

  <x-core.footer />

</x-base>
`;
}

/** Custom raw-HTML starter for code (HTML) editing mode */
function codeStarter(title: string) {
  const safeTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${safeTitle}</title>
</head>
<body style="margin:0; padding:0; background-color:#eef2f7;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
    Add your preview text for ${safeTitle} here.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; background-color:#eef2f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; max-width:600px; border-collapse:separate; background-color:#ffffff; border:1px solid #dbe4f0; border-radius:18px;">
          <tr>
            <td style="padding:32px 40px 12px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; letter-spacing:0.08em; text-transform:uppercase; color:#4f46e5;">
              {{location.name}}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 12px; font-family:Arial, Helvetica, sans-serif; font-size:32px; line-height:40px; font-weight:700; color:#111827;">
              Your headline goes here
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 16px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#4b5563;">
              Hi {{contact.first_name}},
              <br><br>
              Start with a clear summary of the message, the offer, or the update. Replace this starter with your own custom HTML layout, sections, images, and copy.
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                <tr>
                  <td align="center" bgcolor="#4f46e5" style="border-radius:999px;">
                    <a href="#" style="display:inline-block; padding:14px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:14px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#ffffff; text-decoration:none;">
                      Take Action
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#6b7280;">
              Add supporting details, deadlines, disclaimers, or secondary links here.
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px; border-top:1px solid #e5e7eb; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:22px; color:#6b7280;">
              <strong style="color:#111827;">{{location.name}}</strong><br>
              {{location.address}}<br>
              {{location.city}}, {{location.state}} {{location.postal_code}}<br>
              {{location.phone}}<br>
              <a href="{{location.website}}" style="color:#4f46e5; text-decoration:none;">{{location.website}}</a><br><br>
              <a href="{{unsubscribe_link}}" style="color:#6b7280; text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Get the appropriate starter template for the given editor mode.
 */
export function getStarterTemplate(mode: 'visual' | 'code', title = 'Untitled Template'): string {
  return mode === 'code' ? codeStarter(title) : visualStarter(title);
}
