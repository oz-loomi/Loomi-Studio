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

## Template Builder Architecture

### Overview
The template editor is the core tool for creating and editing email templates. It has two modes:

- **Visual mode (Drag & Drop)** — Component-driven editing. Templates are stored as structured data: a `ParsedTemplate` with `frontmatter`, `baseProps`, and an ordered array of `components`. Each component has a `type` and `props` (key-value string pairs).
- **Code mode** — Raw Maizzle HTML editing with a Monaco code editor. Templates use `<x-base>` as the root wrapper and `<x-core.{type}>` tags for each component.

### Template Structure

```
---
subject: Your Subject Line
previewText: Preview text shown in inbox
---
<x-base body-bg="#ffffff" body-width="600px" font-family="Arial, sans-serif">
  <x-core.header logo-url="{{custom_values.logo_url}}" />
  <x-core.hero headline="Welcome" />
  <x-core.spacer size="32px" />
  <x-core.copy body="Your message here" />
  <x-core.cta button-text="Click Here" button-url="https://example.com" />
  <x-core.footer />
</x-base>
```

**Frontmatter** (YAML between `---`):
- `subject` — Email subject line
- `previewText` — Preview/preheader text

**BaseProps** (attributes on `<x-base>`):
- `body-bg` — Email body background color (default: `#ffffff`)
- `body-width` — Max content width (default: `600px`)
- `font-family` — Primary font stack (default: `Arial, sans-serif`)
- `font-color` — Default text color

**Components** — Ordered list of `<x-core.{type}>` tags with props as attributes.

### Compilation
Templates are compiled through Maizzle (PostHTML + Tailwind CSS for email). The visual editor uses a fast "preview mode" that skips full CSS processing for instant feedback. Export/publish uses the full pipeline with CSS inlining and purging.

---

## Component Catalog

The following components are available in the visual editor. Each has a `type` name used in code and a set of configurable props.

### Structural Components (always use these)

#### `header` — Header
Logo bar at the top of every email.
- **Key props:** `logo-url` (image), `logo-alt` (text), `link-url` (URL), `bg-color`, `align`, `logo-width`, `padding`
- **Best practice:** Always use `{{custom_values.logo_url}}` for logo, `{{custom_values.website_url}}` for link, `{{location.name}}` for alt text.

#### `footer` — Footer
Business info, social links, legal text, and unsubscribe.
- **Key props:** `logo-url` (image), `logo-width`, `bg-color` (default: `#111111`), `dealer-name`, `text-color`, `dealer-name-color`, `phone-color`
- **Social URLs:** `facebook-url`, `instagram-url`, `youtube-url`, `linkedin-url`, `tiktok-url`, `x-url`
- **Best practice:** Always use template variables: `{{custom_values.logo_url}}`, `{{location.name}}`. Social URLs pull from account custom values.

#### `spacer` — Spacer
Vertical spacing between components.
- **Key props:** `size` (default: `48px`), `bg-color` (default: `#ffffff`)
- **Best practice:** Use between content sections. Common sizes: `24px`, `32px`, `48px`.

#### `divider` — Divider
Horizontal line separator.
- **Key props:** `color` (default: `#e5e7eb`), `thickness` (default: `1px`), `style` (solid/dashed/dotted), `bg-color`, `padding`

### Content Components

#### `hero` — Hero Banner
Full-width hero with background image, headline, subheadline, and up to 2 CTAs.
- **Key text props:** `eyebrow`, `headline` (required), `subheadline`
- **Key color props:** `eyebrow-color`, `headline-color`, `subheadline-color`
- **Background:** `bg-image` (image URL), `fallback-bg` (color), `overlay-opacity` (0-100)
- **Primary button:** `primary-button-text`, `primary-button-url`, `primary-button-bg-color`, `primary-button-text-color`, `primary-button-radius`, `primary-button-padding`
- **Secondary button:** `secondary-button-text`, `secondary-button-url`, `secondary-button-bg-color`, `secondary-button-text-color`, `secondary-button-border-style`, `secondary-button-border-width`, `secondary-button-border-color`
- **Layout:** `hero-height` (default: `500px`), `text-align`, `content-valign`, `content-padding`
- **Best practice:** Use a high-impact headline (5-8 words). Primary button should be the main CTA. Secondary button is optional.

#### `copy` — Copy Block
Text paragraph section with optional greeting.
- **Key props:** `greeting` (default: `Hi {{contact.first_name}},`), `body` (required, textarea), `greeting-color`, `body-color`, `line-height`, `bg-color`, `align`, `padding`
- **Best practice:** Keep body text 2-3 sentences. Use `{{contact.first_name}}` in greeting for personalization.

#### `cta` — Button
Standalone call-to-action button with optional phone line.
- **Key props:** `button-text`, `button-url`, `button-bg-color`, `button-text-color`, `button-radius`, `button-padding`, `button-font-size`, `button-font-weight`, `button-letter-spacing`, `button-text-transform`
- **Phone line:** `show-phone` (toggle), `phone-text`, `phone-color`, `phone-link-color`
- **Layout:** `section-bg-color`, `align`, `section-padding`
- **Best practice:** Button text should be an action verb, 2-5 words (e.g., "Schedule Service", "Shop Now", "Learn More").

#### `image` — Image
Full-width or sized image block.
- **Key props:** `image` (required, image URL), `alt` (alt text), `width` (default: `600px`), `max-height`, `radius`, `padding`
- **Best practice:** Always set alt text. Use placeholder image URL when generating.

#### `split` — Split Section
Two-column layout: image on one side, text + CTAs on the other.
- **Key text props:** `eyebrow`, `headline` (required), `description`
- **Key color props:** `eyebrow-color`, `headline-color`, `description-color`
- **Image:** `image` (required), `image-alt`, `image-fit`, `image-position`, `overlay-opacity`
- **Background:** `bg-color`, `text-bg-color`
- **Primary button:** `primary-button-text`, `primary-button-url`, `primary-button-bg-color`, `primary-button-text-color`
- **Secondary button:** `secondary-button-text`, `secondary-button-url`
- **Layout:** `text-align`, `content-valign`, `content-padding`
- **Best practice:** Great for product showcases, service highlights, or feature spotlights.

#### `features` — Features Grid
2x2 grid of feature cards with icons or images.
- **Key props:** `section-title`, `title-color`, `text-color`, `bg-color`, `card-bg-color`, `accent-color`, `variant` (icon/image), `card-radius`
- **Repeatable items (up to 4):** `feature1` through `feature4` (title), `feature{n}-desc` (description), `feature{n}-icon` (icon URL), `feature{n}-image` (image URL)
- **Best practice:** Use 3-4 features with concise titles and 1-sentence descriptions.

#### `vehicle-card` — Vehicle Card
Customer's vehicle info card with optional stats.
- **Key props:** `card-label`, `vehicle-year`, `vehicle-make`, `vehicle-model`
- **Stats:** `show-stats`, `stat-1-label`, `stat-1-value`, `stat-2-label`, `stat-2-value`
- **Colors:** `label-color`, `vehicle-color`, `stat-label-color`, `stat-value-color`, `bg-color`, `accent-color`
- **Best practice:** Use template variables: `{{contact.vehicle_year}}`, `{{contact.vehicle_make}}`, `{{contact.vehicle_model}}`.

#### `image-overlay` — Image Overlay
Image with text and CTA overlay.
- **Key props:** `heading`, `description`, `heading-color`, `image` (required), `overlay` (light/medium/dark/heavy)
- **Button:** `button-text`, `button-url`, `button-bg-color`, `button-text-color`
- **Layout:** `align`, `content-padding`

#### `image-card-overlay` — Image Card Overlay
Background image with a floating card containing text and CTA.
- **Key props:** `eyebrow`, `headline`, `body`, `background-image` (required), `card-background`
- **Colors:** `eyebrow-color`, `headline-color`, `body-color`
- **Button:** `cta-text`, `cta-url`, `cta-bg-color`, `cta-text-color`
- **Layout:** `card-align`, `card-max-width`, `card-padding`, `card-radius`

#### `countdown-stat` — Countdown Stat
Urgency/countdown display for time-limited offers.
- **Key props:** `label` (default: `Offer Ends In`), `value` (required, default: `3 DAYS`), `caption`
- **Colors:** `value-color`, `label-color`, `caption-color`, `bg-color`
- **Layout:** `align`, `radius`, `padding`
- **Best practice:** Use for promotions with deadlines. Keep the value bold and short.

#### `testimonial` — Testimonial
Customer review/testimonial quote block.
- **Key props:** `quote` (required), `author`, `source` (e.g., "Google Review")
- **Colors:** `quote-color`, `author-color`, `source-color`, `bg-color`, `accent-color`
- **Layout:** `align`, `radius`, `padding`
- **Best practice:** Keep quotes 1-2 sentences. Include author name and source for credibility.

---

## Email Generation Guidelines

### When to ask clarifying questions
Before generating a full email, ask the user for details if ANY of these are unclear:
- **Purpose/type** — What kind of email? (service reminder, promotion, newsletter, welcome, etc.)
- **Key message** — What's the main thing the reader should know or do?
- **Call to action** — What action should the reader take?
- **Tone** — Professional, casual, urgent, friendly?
- **Special content** — Any specific offer, deadline, product, or event to mention?

If the user provides a clear, specific request (e.g., "Build a service reminder email with a 15% oil change discount"), generate immediately without asking.

### Component ordering conventions
A well-structured email follows this order:
1. `header` — Always first
2. `hero` or `image` — Visual hook (optional but recommended)
3. `spacer` — Breathing room
4. `copy` — Main message body
5. Content components as needed (`split`, `features`, `vehicle-card`, `testimonial`, `countdown-stat`, etc.)
6. `spacer` — Before CTA
7. `cta` — Primary call to action
8. `spacer` — Before footer
9. `footer` — Always last

### Applying account branding
When account branding is available in the context:
- **Primary color** → Use for main CTA button backgrounds (`button-bg-color`, `primary-button-bg-color`)
- **Secondary color** → Use for secondary buttons or accent elements
- **Accent color** → Use for highlights, borders, or small decorative elements
- **Background color** → Use for section backgrounds if the brand uses a non-white base
- **Text color** → Use for body text color if not standard dark gray
- **Brand fonts** → Reference in baseProps `font-family` if email-safe (Arial, Helvetica, Georgia, Verdana, etc.)
- When no branding is available, use safe defaults: `#111111` (dark text), `#ffffff` (white backgrounds), `#4b5563` (gray secondary text)

### Image handling
- For ALL image props (`bg-image`, `image`, `feature{n}-image`, `feature{n}-icon`, `logo-url`), use the placeholder image URL unless the user provides specific images
- Placeholder: `https://loomistorage.sfo3.digitaloceanspaces.com/media/_admin/69fa3adf4ae444edaadd1d0d7fee4b87/image placeholder.png`
- For logos, always use `{{custom_values.logo_url}}`
- Tell the user they can replace placeholder images with their own from the media library

### Template variable usage
- **Contact personalization:** `{{contact.first_name}}`, `{{contact.last_name}}`, `{{contact.email}}`
- **Vehicle data:** `{{contact.vehicle_year}}`, `{{contact.vehicle_make}}`, `{{contact.vehicle_model}}`
- **Location/business:** `{{location.name}}`, `{{location.phone}}`, `{{location.address}}`
- **Custom values:** `{{custom_values.website_url}}`, `{{custom_values.service_scheduler_url}}`, `{{custom_values.logo_url}}`
- **System:** `{{unsubscribe_link}}`

### Email best practices
- **Width:** Always 600px (set in baseProps `body-width`)
- **Fonts:** Use email-safe font stacks: Arial, Helvetica, Georgia, Verdana, Tahoma
- **Colors:** Ensure text has sufficient contrast against backgrounds (WCAG AA minimum)
- **CTAs:** One primary CTA per email. Make it prominent and action-oriented.
- **Copy:** Keep email body concise — 50-150 words for promotional, up to 250 for newsletters
- **Subject lines:** 6-10 words, no spam triggers, create curiosity or urgency
- **Preview text:** 40-90 characters, complements subject line

### Email types and typical structures

**Service Reminder:**
header → hero (vehicle/service image) → spacer → copy (personalized greeting + service message) → vehicle-card → spacer → cta (schedule service) → spacer → footer

**Promotional/Sale:**
header → hero (bold offer headline + CTA) → spacer → copy (offer details) → countdown-stat (deadline) → spacer → features (benefits) → spacer → cta (shop now) → spacer → footer

**Newsletter:**
header → hero (newsletter title) → spacer → copy (intro) → split (featured article) → spacer → features (more articles) → spacer → cta (read more) → spacer → footer

**Welcome:**
header → hero (welcome message) → spacer → copy (introduction + what to expect) → spacer → features (key benefits/features) → spacer → cta (get started) → spacer → footer

**Testimonial/Social Proof:**
header → image (product/service photo) → spacer → copy (intro message) → testimonial → spacer → cta (take action) → spacer → footer

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

### How do I create an email?
Open the template editor from Templates, choose visual or code mode, add components (visual) or write Maizzle HTML (code), then save and optionally publish to your ESP.

### How do I add a new account?
Create the account in Accounts, save business/branding data, then connect an ESP from Integrations.

### How do I connect GoHighLevel?
Use OAuth from Integrations at the account level.

### How do I connect Klaviyo?
Use API key connection from Integrations at the account level.

### How do I use the AI assistant in the template editor?
Click the sparkle button in the bottom-right corner or press Cmd/Ctrl+Shift+A. Ask Loomi to build a full email, edit component props, write subject lines, or improve copy. Loomi can generate complete emails using your account's branding.

### Why are some custom values not syncing?
Custom value sync depends on provider capability and connection state. Values can still be saved locally when provider sync is unavailable.

---

## Technical Notes

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + CSS variables
- **Database:** PostgreSQL via Prisma
- **Auth:** NextAuth credentials flow
- **Rendering:** Maizzle for email template compilation
- **AI:** Anthropic Claude API integration
- **Integrations:** Provider-agnostic ESP adapter architecture
- **Secrets:** ESP token encryption requires `ESP_TOKEN_SECRET`; OAuth state signing requires `ESP_OAUTH_STATE_SECRET` (with `ESP_TOKEN_SECRET` fallback)
- **OAuth callbacks:** Signed OAuth state carries provider + account key in a provider-agnostic format

---

## Dynamic Data

Runtime-generated dynamic data is appended automatically (components, template variables, template tags, categories).
