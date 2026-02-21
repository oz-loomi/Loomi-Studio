# ESP Email Templates — Two-Way Sync + CRUD

## Overview
Add a `templates` capability to the ESP adapter system so Loomi Studio can pull email templates from each account's ESP provider (GHL or Klaviyo), display them alongside existing Loomi templates on the `/templates` page, and provide full CRUD with optional sync-back to the ESP (user-confirmed).

## ESP API Endpoints

### GHL
| Operation | Method | Path | Notes |
|-----------|--------|------|-------|
| List | GET | `/emails/builder?locationId=` | Returns template metadata (name, type, previewUrl) — no `editorData` |
| Create | POST | `/emails/builder` | Body: `{ locationId, name, html, templateDataUrl?, type? }` |
| Update | POST | `/emails/builder/data` | Body: `{ locationId, templateId, editorData/html }` |
| Delete | DELETE | `/emails/builder/:locationId/:templateId` | |

### Klaviyo
| Operation | Method | Path | Notes |
|-----------|--------|------|-------|
| List | GET | `/templates/` | JSON:API format, scopes: `templates:read` |
| Get | GET | `/templates/{id}/` | Full HTML + metadata |
| Create | POST | `/templates/` | Body: `{ data: { type: "template", attributes: { name, editor_type, html, text } } }` |
| Update | PATCH | `/templates/{id}/` | Same body structure, scopes: `templates:write` |
| Delete | DELETE | `/templates/{id}/` | |
| Clone | POST | `/api/template-clone/` | |
| Render | POST | `/api/template-render/` | |

---

## Implementation Plan

### Step 1: Add `EspTemplate` types + `TemplatesAdapter` interface

**File: `src/lib/esp/types.ts`**

Add:
```typescript
export interface EspTemplate {
  id: string;
  name: string;
  type: string;        // "html" | "builder" | "code" etc.
  html?: string;       // Full HTML content when available
  previewUrl?: string;  // Thumbnail/preview URL
  createdAt?: string;
  updatedAt?: string;
}

export interface TemplatesAdapter {
  readonly provider: EspProvider;
  fetchTemplates(token: string, locationId: string): Promise<EspTemplate[]>;
  fetchTemplate(token: string, locationId: string, templateId: string): Promise<EspTemplate | null>;
  createTemplate(token: string, locationId: string, input: { name: string; html: string }): Promise<EspTemplate>;
  updateTemplate(token: string, locationId: string, templateId: string, input: { name?: string; html?: string }): Promise<EspTemplate>;
  deleteTemplate(token: string, locationId: string, templateId: string): Promise<void>;
}
```

Update `EspCapabilities` to add `templates: boolean`.
Update `EspAdapter` to add `readonly templates?: TemplatesAdapter`.

### Step 2: GHL Templates Adapter

**New file: `src/lib/esp/adapters/ghl/templates.ts`**

- `fetchTemplates()` — `GET /emails/builder?locationId=` with 5-min cache
- `fetchTemplate()` — Currently GHL has no single-template GET, so filter from cached list (metadata only, no HTML body available from list endpoint)
- `createTemplate()` — `POST /emails/builder` with `{ locationId, name, html }`
- `updateTemplate()` — `POST /emails/builder/data` with `{ locationId, templateId, html }`
- `deleteTemplate()` — `DELETE /emails/builder/:locationId/:templateId`

**Update: `src/lib/esp/adapters/ghl/index.ts`**
- Import new templates module
- Add `GhlTemplatesAdapter` class
- Wire into `GhlAdapter` composite, set `templates: true` in capabilities

### Step 3: Klaviyo Templates Adapter

**New file: `src/lib/esp/adapters/klaviyo/templates.ts`**

- `fetchTemplates()` — `GET /templates/` with JSON:API response parsing, 5-min cache
- `fetchTemplate()` — `GET /templates/{id}/` returns full HTML
- `createTemplate()` — `POST /templates/` with JSON:API body
- `updateTemplate()` — `PATCH /templates/{id}/`
- `deleteTemplate()` — `DELETE /templates/{id}/`

All requests include `revision: 2025-01-15` header and `Authorization: Klaviyo-API-Key {key}`.

**Update: `src/lib/esp/adapters/klaviyo/index.ts`**
- Import new templates module
- Add `KlaviyoTemplatesAdapter` class
- Wire into `KlaviyoAdapter` composite, set `templates: true` in capabilities

### Step 4: API Routes

**New file: `src/app/api/esp/templates/route.ts`**

```
GET /api/esp/templates?accountKey=
  → Fetch all ESP templates for account
  → Auth: requireAuth(), account access check

POST /api/esp/templates
  → Create template in ESP
  → Body: { accountKey, name, html }
  → Auth: requireRole('developer', 'admin')

PUT /api/esp/templates
  → Update template in ESP
  → Body: { accountKey, templateId, name?, html? }
  → Auth: requireRole('developer', 'admin')

DELETE /api/esp/templates?accountKey=&templateId=
  → Delete template from ESP
  → Auth: requireRole('developer', 'admin')
```

All routes use `resolveAdapterAndCredentials(accountKey, { requireCapability: 'templates' })`.

### Step 5: Sync-to-ESP Confirmation Flow

When a user edits a template in Loomi and saves, the UI will:
1. Save locally to Loomi DB (always happens)
2. Show a confirmation dialog: "Also update this template in [GHL/Klaviyo]?"
   - "Save to Loomi only" — done
   - "Save & sync to [ESP]" — calls `PUT /api/esp/templates` to push changes

Same pattern for create (offer to also create in ESP) and delete (offer to also delete from ESP).

This is a **UI-layer concern** — the API routes are separate endpoints. The frontend orchestrates the two calls.

### Step 6: Templates Page Integration

**File: `src/app/templates/page.tsx`**

Changes:
- Add a new data source: `GET /api/esp/templates?accountKey=` fetched per-account
- ESP templates displayed in a new section/filter on the existing "Account Templates" tab
- Each ESP template card shows:
  - Name, type badge, preview thumbnail (if available), ESP provider badge
  - Actions: "Import to Loomi" (creates local AccountEmail from ESP HTML), "Edit" (opens editor), "Delete from ESP"
- "Import All" bulk action for first-time pull
- Filter/toggle: "Loomi Templates" | "ESP Templates" | "All"

### Step 7: Import Flow (Pull from ESP → Loomi)

When importing an ESP template:
1. Fetch full template HTML via adapter (Klaviyo returns full HTML; GHL returns metadata only from list, so we use the preview HTML approach or the create-based workaround)
2. Create a new `Template` in Loomi's library with the imported HTML
3. Optionally create an `AccountEmail` linking to that template for the account
4. Mark as "imported from [ESP]" with metadata

---

## File Summary

| Action | File |
|--------|------|
| Edit | `src/lib/esp/types.ts` — Add `EspTemplate`, `TemplatesAdapter`, update `EspCapabilities` + `EspAdapter` |
| Create | `src/lib/esp/adapters/ghl/templates.ts` — GHL templates CRUD |
| Edit | `src/lib/esp/adapters/ghl/index.ts` — Wire GHL templates adapter |
| Create | `src/lib/esp/adapters/klaviyo/templates.ts` — Klaviyo templates CRUD |
| Edit | `src/lib/esp/adapters/klaviyo/index.ts` — Wire Klaviyo templates adapter |
| Create | `src/app/api/esp/templates/route.ts` — ESP templates API routes |
| Edit | `src/app/templates/page.tsx` — Integrate ESP templates into UI |

---

## Scopes / Auth Impact

- **GHL**: The emails builder endpoints may require additional OAuth scopes. Need to check if current scopes cover it or if `emails/builder.readonly` / `emails/builder.write` need to be added to `REQUIRED_SCOPES`.
- **Klaviyo**: Requires `templates:read` and `templates:write` scopes on the API key. No OAuth re-auth needed since Klaviyo uses API keys.
