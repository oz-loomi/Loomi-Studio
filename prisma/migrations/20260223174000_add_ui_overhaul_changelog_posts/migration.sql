-- Add changelog posts for the February UI + permissions overhaul
INSERT INTO "ChangelogEntry" (
  "id",
  "title",
  "content",
  "type",
  "publishedAt",
  "createdBy",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'feature_settings_account_scope_20260223',
    'Settings Tabs Now Respect Admin vs Account Context',
    'Settings now split cleanly between admin-level and account-level behavior. Admin dashboard keeps full Accounts visibility (plus Users, Custom Values, Knowledge Base, and Appearance), while account context now uses Account + Integrations + scoped Users/Custom Values views for that specific account.',
    'feature',
    '2026-02-23 17:40:00',
    'Connor',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'feature_user_account_assignment_manager_20260223',
    'Scalable Assigned Accounts Manager for Users',
    'Replaced the large assigned-account chip wall with a dedicated manager flow in user create/edit screens. Includes searchable and sortable account table, pagination (10 rows), bulk actions (select all filtered/clear all), and a compact assigned summary preview.',
    'feature',
    '2026-02-23 17:41:00',
    'Connor',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'improvement_avatar_palette_and_account_stack_20260223',
    'Avatar System Refresh Across Accounts and Users',
    'Default avatars now use the full Tailwind color families for better visual distribution. Users table account associations were upgraded to stacked account avatars with hover tooltips and interaction polish around overlap, spacing, and readability.',
    'improvement',
    '2026-02-23 17:42:00',
    'Connor',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'fix_role_access_persistence_on_account_switch_20260223',
    'Fixed Role Access Loss During Account Switching',
    'Resolved permission regression where admin/developer users lost elevated navigation/features after selecting an account. Elevated roles now retain full admin/dev capabilities (Sections, Flows, Settings) while client roles continue to receive scoped/locked views.',
    'fix',
    '2026-02-23 17:43:00',
    'Connor',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'feature_global_unsaved_changes_guard_20260223',
    'Global Unsaved Changes Protection with Custom Modal',
    'Added an app-wide unsaved-changes guard that detects edited form/input state and intercepts navigation with a custom Loomi modal (no native browser prompt). Users can choose to stay or leave without saving, with support for sidebar navigation, account switching, settings tabs, and back/forward behavior.',
    'feature',
    '2026-02-23 17:44:00',
    'Connor',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'improvement_profile_tables_and_settings_ui_polish_20260223',
    'UI Polish: Profile, Tables, and Form Layout System',
    'Profile and settings experiences were aligned with Loomi styling using frosted section cards, cleaner spacing, and improved form composition. Tables now standardize on the Accounts visual system with pagination/sorting improvements and better overflow handling.',
    'improvement',
    '2026-02-23 17:45:00',
    'Connor',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
