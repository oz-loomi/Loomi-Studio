# ESP Provider Onboarding

This checklist is the fastest path to add a new ESP provider to Loomi Studio's provider-agnostic architecture.

## 1) Implement provider adapter

Create a new adapter module at:

- `src/lib/esp/adapters/<provider>/index.ts`

Implement the provider capabilities required by your rollout:

- `capabilities`
- `contacts`
- `campaigns`
- `connection` and/or `oauth`
- `validation`
- `webhook`
- `customValues`
- `accountDetailsSync`

Reference implementations:

- `src/lib/esp/adapters/ghl/index.ts`
- `src/lib/esp/adapters/klaviyo/index.ts`

## 2) Register provider at startup

Register the adapter in:

- `src/lib/esp/adapters/catalog.ts`

Required:

- add `new <Provider>Adapter()` to `instantiateEspAdapters()`

## 3) Add provider UI + portal config

Add provider metadata in:

- `src/lib/esp/provider-config.ts`

Recommended fields:

- `displayName`
- `description`
- `logoSrc`
- `iconSrc`
- `connectButtonClassName`
- `portalLinks`
- `customValuesSyncDelayMs` (if needed)

## 4) Add webhook family handlers (if supported)

Email stats family:

- Add provider handler in `src/lib/esp/webhooks/providers/<provider>-email-stats.ts`
- Declare handler on adapter `webhookFamilies` map in `src/lib/esp/adapters/<provider>/index.ts`
- Persist stats with `incrementEmailStatsCounter({ provider, accountId, campaignId, ... })`

Generic family routing is already handled by:

- `src/lib/esp/webhooks/families.ts`
- `src/app/api/webhooks/esp/[provider]/[family]/route.ts`

Note:

- Keep `capabilities.webhooks` in sync with `webhookFamilies` declarations (startup validation warns when mismatched)
- Keep capability flags in sync with implemented sub-adapters (startup validation warns on contract mismatches)

## 5) Verify provider appears in provider catalog

Provider metadata endpoint:

- `src/app/api/esp/providers/route.ts`

Expected:

- Provider appears in `providers[]`
- Capabilities are correct
- `webhookEndpoints` reflects supported families

## 6) Add/update fixtures

Webhook fixtures:

- `scripts/fixtures/webhooks/*.json`
- `scripts/esp-webhook-fixtures.ts`

Add fixture payloads for each supported webhook family.

## 7) Run verification gate

Run:

- `npm run esp:verify`

This executes:

- strict TypeScript checks
- OAuth state fixture validation (`scripts/esp-oauth-state-fixtures.ts`)
- webhook fixture validation
- provider/account audit

## 8) Optional migration tasks

If you replace existing provider behavior:

- keep existing webhook URLs active until external provider settings are updated
- prefer provider-family routes (`/api/webhooks/esp/{provider}/{family}`) for all new integrations
