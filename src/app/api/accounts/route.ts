import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { ELEVATED_ROLES } from '@/lib/auth';
import { normalizeOems } from '@/lib/oems';
import * as accountService from '@/lib/services/accounts';
import { buildAccountConnectionMetadata } from '@/lib/esp/account-connection-metadata';
import { normalizeAccountInputAliases } from '@/lib/account-field-aliases';
import { normalizeAccountOutputPayload } from '@/lib/account-output';
import { getDefaultEspProvider } from '@/lib/esp/registry';
import { parseEspProvider, providerValidationMessage } from '@/lib/esp/provider-utils';
import { listOAuthConnections } from '@/lib/esp/oauth-connections';
import { listApiKeyConnections } from '@/lib/esp/api-key-connections';
import { listAccountProviderLinks } from '@/lib/esp/account-provider-links';

export async function GET() {
  try {
    const accounts = await accountService.getAccounts();

    // Fetch connection status in bulk (provider-agnostic OAuth + API-key rows)
    const allKeys = accounts.map(a => a.key);
    const [oauthConnections, espConnections, accountProviderLinks] = await Promise.all([
      listOAuthConnections({ accountKeys: allKeys }),
      listApiKeyConnections({ accountKeys: allKeys }),
      listAccountProviderLinks({ accountKeys: allKeys }).catch(() => []),
    ]);
    const oauthByAccount = new Map<string, Array<{
      provider: string;
      locationId: string | null;
      locationName: string | null;
      installedAt: Date;
    }>>();
    for (const connection of oauthConnections) {
      const list = oauthByAccount.get(connection.accountKey) || [];
      list.push({
        provider: connection.provider,
        locationId: connection.locationId,
        locationName: connection.locationName,
        installedAt: connection.installedAt,
      });
      oauthByAccount.set(connection.accountKey, list);
    }
    const linksByAccount = new Map<string, Array<{
      provider: string;
      locationId: string | null;
      locationName: string | null;
      installedAt: Date;
    }>>();
    for (const link of accountProviderLinks) {
      const list = linksByAccount.get(link.accountKey) || [];
      list.push({
        provider: link.provider,
        locationId: link.locationId,
        locationName: link.locationName,
        installedAt: link.linkedAt,
      });
      linksByAccount.set(link.accountKey, list);
    }
    const espByAccount = new Map<string, Array<{
      provider: string;
      accountId: string | null;
      accountName: string | null;
      installedAt: Date;
    }>>();
    for (const connection of espConnections) {
      const list = espByAccount.get(connection.accountKey) || [];
      list.push({
        provider: connection.provider,
        accountId: connection.accountId,
        accountName: connection.accountName,
        installedAt: connection.installedAt,
      });
      espByAccount.set(connection.accountKey, list);
    }

    // Return as key-indexed account map: { [accountKey]: accountData }
    const result: Record<string, Record<string, unknown>> = {};
    for (const account of accounts) {
      const { key, ...rest } = account;
      const data: Record<string, unknown> = { ...rest };
      delete data.createdAt;
      delete data.updatedAt;
      normalizeAccountOutputPayload(data);
      // Include provider-agnostic connection flags
      const oauth = oauthByAccount.get(key) || [];
      const links = linksByAccount.get(key) || [];
      const mergedOauth = [...oauth];
      const oauthProviders = new Set(oauth.map((entry) => entry.provider));
      for (const link of links) {
        if (oauthProviders.has(link.provider)) continue;
        mergedOauth.push(link);
      }
      const esp = espByAccount.get(key) || [];
      const metadata = buildAccountConnectionMetadata({
        accountProvider: account.espProvider,
        oauthConnections: mergedOauth,
        espConnections: esp,
      });
      Object.assign(data, metadata);
      result[key] = data;
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: 'Could not read accounts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole(...ELEVATED_ROLES);
  if (error) return error;
  try {
    const payload = await req.json() as Record<string, unknown>;
    normalizeAccountInputAliases(payload);
    const {
      key,
      dealer,
      category,
      oem,
      oems,
      email,
      phone,
      salesPhone,
      servicePhone,
      partsPhone,
      address,
      city,
      state,
      postalCode,
      website,
      timezone,
      espProvider,
      accountRepId,
    } = payload as {
      key?: string;
      dealer?: string;
      category?: string;
      oem?: string;
      oems?: unknown;
      email?: string;
      phone?: string;
      salesPhone?: string;
      servicePhone?: string;
      partsPhone?: string;
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      website?: string;
      timezone?: string;
      espProvider?: string;
      accountRepId?: string;
    };
    if (!key || !dealer) {
      return NextResponse.json({ error: 'Missing key and dealer' }, { status: 400 });
    }
    const safeKey = key.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeKey) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }

    const existing = await accountService.getAccount(safeKey);
    if (existing) {
      return NextResponse.json({ error: 'Account key already exists' }, { status: 409 });
    }

    const normalizedOems = normalizeOems(oems, oem);
    const parsedProvider = parseEspProvider(espProvider);
    if (espProvider && !parsedProvider) {
      return NextResponse.json({ error: providerValidationMessage('espProvider') }, { status: 400 });
    }

    const accountData: Parameters<typeof accountService.createAccount>[0] = {
      key: safeKey,
      dealer: dealer.trim(),
      category: category || 'General',
      espProvider: parsedProvider || getDefaultEspProvider(),
      logos: JSON.stringify({ light: '', dark: '' }),
    };

    if (normalizedOems.length > 0) {
      accountData.oems = JSON.stringify(normalizedOems);
      accountData.oem = normalizedOems[0];
    }

    if (email) accountData.email = email;
    if (phone) accountData.phone = phone;
    if (salesPhone) accountData.salesPhone = salesPhone;
    if (servicePhone) accountData.servicePhone = servicePhone;
    if (partsPhone) accountData.partsPhone = partsPhone;
    if (address) accountData.address = address;
    if (city) accountData.city = city;
    if (state) accountData.state = state;
    if (postalCode) accountData.postalCode = postalCode;
    if (website) accountData.website = website;
    if (timezone) accountData.timezone = timezone;
    if (accountRepId) accountData.accountRepId = accountRepId;

    const account = await accountService.createAccount(accountData);
    return NextResponse.json({ key: account.key, dealer: account.dealer });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireRole(...ELEVATED_ROLES);
  if (error) return error;
  try {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    const existing = await accountService.getAccount(key);
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await accountService.deleteAccount(key);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
