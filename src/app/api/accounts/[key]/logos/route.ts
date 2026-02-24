import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import * as accountService from '@/lib/services/accounts';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import type { MediaUploadInput } from '@/lib/esp/types';
import fs from 'fs';
import path from 'path';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Attempt to upload a logo to the account's ESP media library.
 * Returns the ESP-hosted URL on success, or null if ESP is unavailable/fails.
 */
async function tryEspUpload(
  accountKey: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ url: string; provider: string } | null> {
  try {
    const result = await resolveAdapterAndCredentials(accountKey, {
      requireCapability: 'media',
    });

    if (isResolveError(result)) {
      return null;
    }

    const { adapter, credentials } = result;
    if (!adapter.media) {
      return null;
    }

    const input: MediaUploadInput = {
      file: buffer,
      name: fileName,
      mimeType,
    };

    const uploaded = await adapter.media.uploadMedia(
      credentials.token,
      credentials.locationId,
      input,
    );

    return { url: uploaded.url, provider: adapter.provider };
  } catch (err) {
    console.error(`[logos] ESP upload failed for ${accountKey}:`, err);
    return null;
  }
}

/**
 * POST /api/accounts/[key]/logos
 *
 * Upload a logo file for an account.
 * Primary: uploads to the account's connected ESP media library (GHL, Klaviyo, etc.)
 * Fallback: saves locally to /public/logos/[key]/[variant].[ext] when no ESP is available.
 *
 * Body: multipart/form-data with `file` (image) and `variant` (light|dark|white|black|storefront)
 * Returns: { url: string, source: 'esp' | 'local' }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const { key } = await params;
    const account = await accountService.getAccount(key);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const variant = formData.get('variant') as string | null;

    if (!file || !variant) {
      return NextResponse.json({ error: 'Missing file or variant' }, { status: 400 });
    }

    if (!['light', 'dark', 'white', 'black', 'storefront'].includes(variant)) {
      return NextResponse.json({ error: 'Invalid variant. Must be light, dark, white, black, or storefront' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: PNG, JPG, SVG, WebP' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 5MB' }, { status: 400 });
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/svg+xml': 'svg',
      'image/webp': 'webp',
    };
    const ext = extMap[file.type] || 'png';
    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Try ESP media library first ──
    const espFileName = `loomi-${key}-logo-${variant}.${ext}`;
    const espResult = await tryEspUpload(key, buffer, espFileName, file.type);

    let url: string;
    let source: string;

    if (espResult) {
      url = espResult.url;
      source = 'esp';
    } else {
      // ── Fallback: save locally ──
      const logoDir = path.join(process.cwd(), 'public', 'logos', key);
      if (!fs.existsSync(logoDir)) {
        fs.mkdirSync(logoDir, { recursive: true });
      }

      // Remove old files for this variant (any extension)
      const existingFiles = fs.readdirSync(logoDir);
      for (const f of existingFiles) {
        if (f.startsWith(`${variant}.`)) {
          fs.unlinkSync(path.join(logoDir, f));
        }
      }

      const fileName = `${variant}.${ext}`;
      const filePath = path.join(logoDir, fileName);
      fs.writeFileSync(filePath, buffer);
      url = `/logos/${key}/${fileName}`;
      source = 'local';
    }

    // ── Update account data via Prisma ──
    if (variant === 'storefront') {
      let existingCustomValues: Record<string, { name?: string; value?: string }> = {};
      if (account.customValues) {
        try {
          existingCustomValues = JSON.parse(account.customValues);
        } catch {
          existingCustomValues = {};
        }
      }
      const currentStorefront = existingCustomValues.storefront_image || {};
      existingCustomValues.storefront_image = {
        name: currentStorefront.name || 'Storefront Image',
        value: url,
      };
      await accountService.updateAccount(key, {
        customValues: JSON.stringify(existingCustomValues),
      });
    } else {
      let logos: Record<string, unknown> = {};
      if (account.logos) {
        try {
          logos = JSON.parse(account.logos);
        } catch {
          logos = {};
        }
      }
      logos[variant] = url;
      await accountService.updateAccount(key, {
        logos: JSON.stringify(logos),
      });
    }

    return NextResponse.json({ url, source });
  } catch (err) {
    console.error('Logo upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
