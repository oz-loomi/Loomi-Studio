import 'dotenv/config';
import '@/lib/esp/init';
import { prisma } from '@/lib/prisma';
import { getAdapterForAccount, getDefaultEspProvider, getRegisteredProviders } from '@/lib/esp/registry';
import { getEspConnectionsStatus } from '@/lib/esp/connections';
import type { EspProvider } from '@/lib/esp/types';
import { listWebhookFamilies, supportsProviderWebhookFamily } from '@/lib/esp/webhooks/families';

type AuditRow = {
  key: string;
  dealer: string;
  dbProvider: string;
  adapterProvider: string;
  connectedProviders: string;
  activeConnected: string;
  cvScopeReady: string;
  auth: string;
  contacts: string;
  campaigns: string;
  webhooks: string;
  webhookFamilies: string;
  customValues: string;
  businessSync: string;
  notes: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  let includeInternal = false;
  let keyFilter: Set<string> | null = null;

  for (const arg of args) {
    if (arg === '--include-internal') {
      includeInternal = true;
      continue;
    }
    if (arg.startsWith('--keys=')) {
      const value = arg.slice('--keys='.length);
      const keys = value
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      keyFilter = new Set(keys);
    }
  }

  return { includeInternal, keyFilter };
}

function formatRow(row: AuditRow): string {
  return [
    row.key,
    row.dealer,
    row.dbProvider,
    row.adapterProvider,
    row.connectedProviders,
    row.activeConnected,
    row.cvScopeReady,
    row.auth,
    row.contacts,
    row.campaigns,
    row.webhooks,
    row.webhookFamilies,
    row.customValues,
    row.businessSync,
    row.notes,
  ].join(' | ');
}

async function main() {
  const { includeInternal, keyFilter } = parseArgs();
  const registeredProviders = getRegisteredProviders();
  const defaultProvider = getDefaultEspProvider();

  const accounts = await prisma.account.findMany({
    select: {
      key: true,
      dealer: true,
      espProvider: true,
    },
    orderBy: { dealer: 'asc' },
  });

  const targetAccounts = accounts.filter((account) => {
    if (!includeInternal && account.key.startsWith('_')) return false;
    if (keyFilter && !keyFilter.has(account.key)) return false;
    return true;
  });

  console.log(`Registered providers: ${registeredProviders.join(', ') || '(none)'}`);
  console.log(`Default provider: ${defaultProvider}`);
  console.log(`Accounts audited: ${targetAccounts.length}`);
  console.log('');
  console.log('key | dealer | dbProvider | adapterProvider | connectedProviders | activeConnected | cvScopeReady | auth | contacts | campaigns | webhooks | webhookFamilies | customValues | businessSync | notes');

  const knownWebhookFamilies = listWebhookFamilies();

  const rows: AuditRow[] = [];

  for (const account of targetAccounts) {
    const dbProvider = (account.espProvider || '').trim() || defaultProvider;

    let adapterProvider = 'ERROR';
    let auth = 'n/a';
    let contacts = 'n/a';
    let campaigns = 'n/a';
    let webhooks = 'n/a';
    let webhookFamilies = 'n/a';
    let customValues = 'n/a';
    let businessSync = 'n/a';
    let cvScopeReady = 'n/a';
    let adapterRequiredOauthScopes: string[] = [];
    const notes: string[] = [];

    let status:
      | Awaited<ReturnType<typeof getEspConnectionsStatus>>
      | null = null;

    try {
      status = await getEspConnectionsStatus(account.key);
    } catch (err) {
      notes.push(`status error: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    try {
      const adapter = await getAdapterForAccount(account.key);
      adapterProvider = adapter.provider;
      auth = adapter.capabilities.auth;
      contacts = adapter.capabilities.contacts ? 'yes' : 'no';
      campaigns = adapter.capabilities.campaigns ? 'yes' : 'no';
      webhooks = adapter.capabilities.webhooks ? 'yes' : 'no';
      const supportedFamilies = knownWebhookFamilies
        .filter((family) => supportsProviderWebhookFamily(adapter.provider, family));
      webhookFamilies = supportedFamilies.length > 0 ? supportedFamilies.join(',') : '-';
      customValues = adapter.capabilities.customValues ? 'yes' : 'no';
      businessSync = adapter.accountDetailsSync ? 'yes' : 'no';
      adapterRequiredOauthScopes = adapter.oauth?.requiredScopes || [];
    } catch (err) {
      notes.push(`adapter error: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    if (account.espProvider && adapterProvider !== 'ERROR' && account.espProvider !== adapterProvider) {
      notes.push(`db/adptr mismatch (${account.espProvider} != ${adapterProvider})`);
    }
    if (status && adapterProvider !== 'ERROR' && status.accountProvider !== adapterProvider) {
      notes.push(`status/adptr mismatch (${status.accountProvider} != ${adapterProvider})`);
    }
    if (webhooks === 'yes' && webhookFamilies === '-') {
      notes.push(`webhook families not implemented for ${adapterProvider}`);
    }

    const connectedProviders = status?.connectedProviders?.join(',') || '';
    const activeConnected = status && adapterProvider !== 'ERROR'
      ? (status.providers?.[adapterProvider as EspProvider]?.connected ? 'yes' : 'no')
      : 'n/a';
    const activeProviderStatus = status?.providers?.[adapterProvider as EspProvider];
    const activeOauthConnected = activeProviderStatus?.oauthConnected === true
      || (activeProviderStatus?.connected === true && activeProviderStatus?.connectionType === 'oauth');
    if (customValues === 'yes' && activeProviderStatus) {
      if (!activeProviderStatus.connected) {
        cvScopeReady = 'no';
      } else if (activeOauthConnected) {
        const scopes = Array.isArray(activeProviderStatus.scopes) ? activeProviderStatus.scopes : [];
        cvScopeReady = adapterRequiredOauthScopes.every((scope) => scopes.includes(scope)) ? 'yes' : 'no';
        if (cvScopeReady === 'no') {
          notes.push(`missing ${adapterProvider} OAuth scopes for custom values`);
        }
      } else {
        // API-key or non-OAuth custom-values providers do not require OAuth scope checks.
        cvScopeReady = 'yes';
      }
    }

    rows.push({
      key: account.key,
      dealer: account.dealer,
      dbProvider,
      adapterProvider,
      connectedProviders: connectedProviders || '-',
      activeConnected,
      cvScopeReady,
      auth,
      contacts,
      campaigns,
      webhooks,
      webhookFamilies,
      customValues,
      businessSync,
      notes: notes.join('; ') || '-',
    });
  }

  for (const row of rows) {
    console.log(formatRow(row));
  }
}

main()
  .catch((err) => {
    console.error('ESP audit failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
