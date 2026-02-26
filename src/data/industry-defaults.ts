/**
 * Industry-specific default custom value templates.
 *
 * When a new account is created with a matching `category`, these custom values
 * are automatically populated (with empty values) so the user only needs to fill
 * in the actual data rather than defining the field structure from scratch.
 *
 * The field keys must match the tokens used in templates, e.g.
 *   `{{custom_values.sales_phone}}` → key: "sales_phone"
 */

export type IndustryDefaults = Record<string, { name: string; value: string }>;

export const INDUSTRY_TEMPLATES: Record<string, IndustryDefaults> = {
  Automotive: {
    dealer_name:          { name: 'Dealer Name',          value: '' },
    sales_phone:          { name: 'Sales Phone',          value: '' },
    service_phone:        { name: 'Service Phone',        value: '' },
    parts_phone:          { name: 'Parts Phone',          value: '' },
    crm_name:             { name: 'CRM Name',             value: '' },
    website_url:          { name: 'Website URL',          value: '' },
    service_scheduler_url:{ name: 'Service Scheduler URL', value: '' },
    logo_url:             { name: 'Logo URL',             value: '' },
    storefront_image:     { name: 'Storefront Image',     value: '' },
    review_link:          { name: 'Review Link',          value: '' },
    trade_in_url:         { name: 'Trade-In URL',         value: '' },
    specials_url:         { name: 'Specials URL',         value: '' },
    facebook:             { name: 'Facebook',             value: '' },
    instagram:            { name: 'Instagram',            value: '' },
    tiktok:               { name: 'TikTok',               value: '' },
    x:                    { name: 'X',                    value: '' },
    youtube:              { name: 'YouTube',              value: '' },
  },
};

/** All supported industry categories that have default templates. */
export const SUPPORTED_INDUSTRIES = Object.keys(INDUSTRY_TEMPLATES);

/**
 * Get the default custom value template for a given industry/category.
 * Returns `null` if no template exists for the category.
 */
export function getIndustryDefaults(category: string): IndustryDefaults | null {
  return INDUSTRY_TEMPLATES[category] ?? null;
}
