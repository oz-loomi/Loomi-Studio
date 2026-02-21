import dotenv from 'dotenv';
import { prisma } from '@/lib/prisma';
import { decryptToken, encryptToken } from '@/lib/esp/encryption';
import { requireEspTokenSecrets } from '@/lib/esp/secrets';

dotenv.config({ path: '.env.local' });
dotenv.config();

type OAuthRow = {
  id: string;
  accountKey: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
};

type ProviderOAuthRow = {
  id: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
};

type ApiKeyRow = {
  id: string;
  accountKey: string;
  provider: string;
  apiKey: string;
};

type MigrationStats = {
  oauthUpdated: number;
  oauthFailed: number;
  providerOauthUpdated: number;
  providerOauthFailed: number;
  apiUpdated: number;
  apiFailed: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

function logFailure(kind: 'oauth' | 'provider-oauth' | 'api', row: OAuthRow | ProviderOAuthRow | ApiKeyRow, err: unknown): void {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const accountKey = 'accountKey' in row ? row.accountKey : '__provider__';
  const context = `${kind}:${row.provider}:${accountKey}`;
  console.error(`[reencrypt] Failed ${context}: ${message}`);
}

async function migrateOAuthRows(rows: OAuthRow[], dryRun: boolean): Promise<Pick<MigrationStats, 'oauthUpdated' | 'oauthFailed'>> {
  let oauthUpdated = 0;
  let oauthFailed = 0;

  for (const row of rows) {
    try {
      const plainAccessToken = decryptToken(row.accessToken);
      const plainRefreshToken = decryptToken(row.refreshToken);
      const encryptedAccessToken = encryptToken(plainAccessToken);
      const encryptedRefreshToken = encryptToken(plainRefreshToken);

      if (!dryRun) {
        await prisma.espOAuthConnection.update({
          where: { id: row.id },
          data: {
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
          },
        });
      }

      oauthUpdated += 1;
    } catch (err) {
      oauthFailed += 1;
      logFailure('oauth', row, err);
    }
  }

  return { oauthUpdated, oauthFailed };
}

async function migrateProviderOAuthRows(
  rows: ProviderOAuthRow[],
  dryRun: boolean,
): Promise<Pick<MigrationStats, 'providerOauthUpdated' | 'providerOauthFailed'>> {
  let providerOauthUpdated = 0;
  let providerOauthFailed = 0;

  for (const row of rows) {
    try {
      const plainAccessToken = decryptToken(row.accessToken);
      const plainRefreshToken = decryptToken(row.refreshToken);
      const encryptedAccessToken = encryptToken(plainAccessToken);
      const encryptedRefreshToken = encryptToken(plainRefreshToken);

      if (!dryRun) {
        await prisma.espProviderOAuthCredential.update({
          where: { id: row.id },
          data: {
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
          },
        });
      }

      providerOauthUpdated += 1;
    } catch (err) {
      providerOauthFailed += 1;
      logFailure('provider-oauth', row, err);
    }
  }

  return { providerOauthUpdated, providerOauthFailed };
}

async function migrateApiKeyRows(rows: ApiKeyRow[], dryRun: boolean): Promise<Pick<MigrationStats, 'apiUpdated' | 'apiFailed'>> {
  let apiUpdated = 0;
  let apiFailed = 0;

  for (const row of rows) {
    try {
      const plainApiKey = decryptToken(row.apiKey);
      const encryptedApiKey = encryptToken(plainApiKey);

      if (!dryRun) {
        await prisma.espConnection.update({
          where: { id: row.id },
          data: {
            apiKey: encryptedApiKey,
          },
        });
      }

      apiUpdated += 1;
    } catch (err) {
      apiFailed += 1;
      logFailure('api', row, err);
    }
  }

  return { apiUpdated, apiFailed };
}

async function main() {
  const { dryRun } = parseArgs();
  requireEspTokenSecrets();

  const [oauthRows, providerOauthRows, apiRows] = await Promise.all([
    prisma.espOAuthConnection.findMany({
      select: {
        id: true,
        accountKey: true,
        provider: true,
        accessToken: true,
        refreshToken: true,
      },
      orderBy: [{ provider: 'asc' }, { accountKey: 'asc' }],
    }),
    prisma.espProviderOAuthCredential.findMany({
      select: {
        id: true,
        provider: true,
        accessToken: true,
        refreshToken: true,
      },
      orderBy: [{ provider: 'asc' }],
    }).catch(() => []),
    prisma.espConnection.findMany({
      select: {
        id: true,
        accountKey: true,
        provider: true,
        apiKey: true,
      },
      orderBy: [{ provider: 'asc' }, { accountKey: 'asc' }],
    }),
  ]);

  console.log(`[reencrypt] Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log(`[reencrypt] OAuth rows: ${oauthRows.length}`);
  console.log(`[reencrypt] Provider OAuth rows: ${providerOauthRows.length}`);
  console.log(`[reencrypt] API-key rows: ${apiRows.length}`);

  const [oauthStats, providerOauthStats, apiStats] = await Promise.all([
    migrateOAuthRows(oauthRows, dryRun),
    migrateProviderOAuthRows(providerOauthRows, dryRun),
    migrateApiKeyRows(apiRows, dryRun),
  ]);

  const stats: MigrationStats = {
    ...oauthStats,
    ...providerOauthStats,
    ...apiStats,
  };

  console.log('');
  console.log('[reencrypt] Summary');
  console.log(`- oauth updated: ${stats.oauthUpdated}`);
  console.log(`- oauth failed: ${stats.oauthFailed}`);
  console.log(`- provider oauth updated: ${stats.providerOauthUpdated}`);
  console.log(`- provider oauth failed: ${stats.providerOauthFailed}`);
  console.log(`- api updated: ${stats.apiUpdated}`);
  console.log(`- api failed: ${stats.apiFailed}`);

  if (stats.oauthFailed > 0 || stats.providerOauthFailed > 0 || stats.apiFailed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[reencrypt] Fatal error:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
