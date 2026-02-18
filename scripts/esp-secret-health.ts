import dotenv from 'dotenv';
import {
  configuredEspOAuthStateSecrets,
  configuredEspTokenSecrets,
} from '@/lib/esp/secrets';

dotenv.config({ path: '.env.local' });
dotenv.config();

function hasValue(key: string): boolean {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

function main() {
  const hasEspTokenSecret = hasValue('ESP_TOKEN_SECRET');
  const hasEspOAuthStateSecret = hasValue('ESP_OAUTH_STATE_SECRET');
  const hasStaleGhlTokenSecret = hasValue('GHL_TOKEN_SECRET');
  const hasStaleLegacyToggle = hasValue('LOOMI_ALLOW_LEGACY_ESP_SECRETS');
  const hasNextAuthSecret = hasValue('NEXTAUTH_SECRET');

  const tokenSecrets = configuredEspTokenSecrets();
  const oauthStateSecrets = configuredEspOAuthStateSecrets();

  console.log('ESP Secret Health');
  console.log('');
  console.log('mode: strict');
  console.log(`ESP_TOKEN_SECRET: ${yesNo(hasEspTokenSecret)}`);
  console.log(`ESP_OAUTH_STATE_SECRET: ${yesNo(hasEspOAuthStateSecret)}`);
  console.log(`GHL_TOKEN_SECRET (stale/ignored): ${yesNo(hasStaleGhlTokenSecret)}`);
  console.log(`LOOMI_ALLOW_LEGACY_ESP_SECRETS (stale/ignored): ${yesNo(hasStaleLegacyToggle)}`);
  console.log(`NEXTAUTH_SECRET: ${yesNo(hasNextAuthSecret)}`);
  console.log('');
  console.log(`resolvedTokenSecretKeys: ${tokenSecrets.length}`);
  console.log(`resolvedOAuthStateSecretKeys: ${oauthStateSecrets.length}`);

  if (tokenSecrets.length === 0 || oauthStateSecrets.length === 0) {
    console.log('');
    console.log('status: ERROR (missing required secrets)');
    process.exitCode = 1;
    return;
  }

  if (hasStaleGhlTokenSecret || hasStaleLegacyToggle) {
    console.log('');
    console.log('note: stale legacy ESP secret keys are present but ignored by ESP runtime');
  }

  if (hasNextAuthSecret) {
    console.log('');
    console.log('note: NEXTAUTH_SECRET is still used by NextAuth, but not by ESP secret resolution');
  }

  console.log('');
  console.log('status: OK');
}

main();
