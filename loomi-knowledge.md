# Loomi Studio Knowledge Base

This file is the source of truth for Loomi Studio AI assistants. Update this file to change what the AI knows.

---

## Platform Overview

Loomi Studio is an internal email production platform built by Oz Marketing. Teams use it to design, manage, and deploy branded email templates across dealership and business accounts.

The platform is built with Next.js 14, uses Maizzle (Tailwind CSS for email) for template rendering, and integrates with ESP providers through a provider-agnostic adapter layer.

Current production providers include:
- GoHighLevel (OAuth)
- Klaviyo (API key)

---

## Navigation And Pages

- **Dashboard** (`/`) - Stats, activity, and account-aware analytics.
- **Templates** (`/templates`) - Browse OEM templates and open the visual/code editor.
- **Sections** (`/components`) - Reusable email components with live preview editing.
- **Emails** (`/emails`) - Account email instances (draft, active, archived), organized by folders.
- **Accounts** (`/accounts`) - Manage account records, branding, and integrations.
- **Settings** (`/settings`) - Accounts, users, integrations, custom values, knowledge, appearance.
- **Users** (`/users`, `/users/[id]`, `/users/new`) - User management for developer/admin permissions.

### Settings Tabs

- **Accounts** - Account list and detail management.
- **Integrations** - Provider connection state, scope status, and reauthorization controls.
- **Custom Values** - Account-level fields used by template variable replacement.
- **Users** - User CRUD and access assignment.
- **Knowledge** - This knowledge base editor.
- **Appearance** - Theme options.

---

## Roles And Permissions

### Developer
- Full system access.
- Can manage users and all accounts.
- Can switch between admin mode and account views.

### Admin
- Can manage templates, emails, and assigned accounts.
- Cannot manage users.

### Client
- Limited account-scoped access.
- No user management or global admin controls.

### Account Switcher
Developers and admins can switch between admin view and assigned account views. Client-role users are restricted to assigned account scope.

---

## Template System

### OEM Coverage
Loomi supports multiple OEM template sets and template types (service, sales, lifecycle, retention, etc.).

### Editor Modes
- **Visual mode** - Component-driven editing.
- **Code mode** - Raw Maizzle HTML editing.

### Architecture
- **Core template package** (`loomi-email-core`) stores reference designs.
- Account-specific email instances are managed inside Loomi Studio.

---

## Account Management

Each account can store:
- Dealer/business identity fields (name, address, phone, website, timezone)
- Branding (logos, colors, fonts)
- Custom values for template substitution
- Provider preference and active ESP connection metadata

Accounts can connect one or more ESP providers. Runtime reads provider capabilities and adjusts UI behavior by provider.
When an account has no explicit `espProvider`, Loomi now resolves the most recently connected provider for that account before falling back to the global default provider.

---

## ESP Integration Model

Loomi uses a provider registry and adapter interfaces for:
- OAuth authorization
- API-key connection validation
- Contacts
- Campaigns
- Workflows/flows
- Messaging (provider dependent)
- Users (provider dependent)
- Webhooks
- Custom values sync (provider dependent)

### Current Provider Capabilities

- **GoHighLevel (`ghl`)**
  - OAuth connection
  - Contacts, campaigns, workflows, messaging, users
  - Custom value sync support
  - Webhook support for email stats

- **Klaviyo (`klaviyo`)**
  - API key connection
  - Contacts, campaigns, flows
  - No native Loomi custom value push today

### OAuth Scope Handling
For OAuth providers, Loomi tracks granted scopes and flags reauthorization when required scopes change.

---

## Campaign Analytics And Webhooks

Loomi supports provider-routed email stats webhook ingestion:
- Primary endpoint format: `POST /api/webhooks/esp/{provider}/email-stats`
- Generic family route format: `POST /api/webhooks/esp/{provider}/{family}`
- Supported providers for `email-stats`: `ghl`, `klaviyo`
- Stores aggregate campaign stats in database
- Campaign webhook stat rows are keyed by `provider + accountId + campaignId`
- Preserves first delivered timestamp for accurate sent-time reporting

Validation and regression command:
- `npm run esp:verify`
  - Includes OAuth state fixtures, webhook fixtures, and provider/account audit checks

Credential re-encryption migration:
- `npm run esp:migrate-env-secrets -- --dry-run` (preview `.env.local` ESP secret additions)
- `npm run esp:migrate-env-secrets` (apply `.env.local` ESP secret additions)
- `npm run esp:migrate-env-secrets -- --cleanup-stale` (remove stale legacy ESP secret keys; `--cleanup-legacy` still works as alias)
- `npm run esp:reencrypt-credentials -- --dry-run` (preview)
- `npm run esp:reencrypt-credentials` (apply)
- `npm run esp:secret-health` (validate active ESP secret configuration)

CI gate:
- GitHub Actions workflow: `.github/workflows/esp-verify.yml`

Provider onboarding checklist:
- `docs/esp-provider-onboarding.md`

---

## Template Variables

Templates use ESP-compatible variables, including:
- Contact fields (`{{contact.first_name}}`, etc.)
- Location/account fields (`{{location.name}}`, `{{location.phone}}`, etc.)
- Custom values (`{{custom_values.website_url}}`, etc.)
- System fields (`{{unsubscribe_link}}`, `{{message.id}}`)

The variable catalog is managed as ESP variables and injected dynamically.

---

## Common Questions

### How do I add a new account?
Create the account in Accounts, save business/branding data, then connect an ESP from Integrations.

### How do I connect GoHighLevel?
Use OAuth from Integrations at the account level.

### How do I connect Klaviyo?
Use API key connection from Integrations at the account level.

### Why are some custom values not syncing?
Custom value sync depends on provider capability and connection state. Values can still be saved locally when provider sync is unavailable.

---

## Technical Notes

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + CSS variables
- **Database:** SQLite via Prisma
- **Auth:** NextAuth credentials flow
- **Rendering:** Maizzle for email template compilation
- **AI:** OpenAI API integration
- **Integrations:** Provider-agnostic ESP adapter architecture
- **Secrets:** ESP token encryption requires `ESP_TOKEN_SECRET`; OAuth state signing requires `ESP_OAUTH_STATE_SECRET` (with `ESP_TOKEN_SECRET` fallback)
- **OAuth callbacks:** Signed OAuth state carries provider + account key in a provider-agnostic format

---

## Dynamic Data

Runtime-generated dynamic data is appended automatically (components, template variables, template tags, categories).
