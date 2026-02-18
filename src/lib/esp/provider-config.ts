export interface CampaignCreateLinks {
  email: string | null;
  text: string | null;
  drip: string | null;
  [key: string]: string | null;
}

export type CampaignStatsParams = {
  locationId?: string | null;
  scheduleId?: string | null;
  bulkRequestId?: string | null;
  folderId?: string | null;
};

export type WorkflowEditParams = {
  locationId?: string | null;
  workflowId?: string | null;
};

export type CampaignEditParams = {
  locationId?: string | null;
  editId?: string | null;
};

export type ProviderPortalLinks = {
  getCampaignCreateLinks: (locationId?: string | null) => CampaignCreateLinks;
  getCampaignHubUrl: (locationId?: string | null) => string | null;
  getCampaignEditUrl: (params: CampaignEditParams) => string | null;
  getCampaignStatsUrl: (params: CampaignStatsParams) => string | null;
  getWorkflowHubUrl: (locationId?: string | null) => string | null;
  getWorkflowEditUrl: (params: WorkflowEditParams) => string | null;
};

export type EspProviderConfig = {
  displayName?: string;
  description?: string;
  logoSrc?: string;
  logoAlt?: string;
  iconSrc?: string;
  iconAlt?: string;
  headerClassName?: string;
  connectButtonClassName?: string;
  customValuesSyncDelayMs?: number;
  portalLinks?: ProviderPortalLinks;
};

const ESP_PROVIDER_CONFIG: Record<string, EspProviderConfig> = {
  ghl: {
    displayName: 'GoHighLevel',
    description: 'CRM, contacts, campaigns, workflows, and messaging in one platform.',
    logoSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d29f3b3cc90258dacc4b.jpg',
    logoAlt: 'GoHighLevel',
    iconSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3c254da0462343bf828.jpg',
    iconAlt: 'GoHighLevel',
    headerClassName: 'bg-white',
    connectButtonClassName: 'bg-[#0c2340] text-white hover:bg-[#163a5f]',
    customValuesSyncDelayMs: 200,
    portalLinks: {
      getCampaignCreateLinks(locationId) {
        if (locationId) {
          const encodedLocationId = encodeURIComponent(locationId);
          return {
            email: `https://app.gohighlevel.com/v2/location/${encodedLocationId}/marketing/emails/scheduled`,
            text: `https://app.gohighlevel.com/v2/location/${encodedLocationId}/contacts/smart_list/All`,
            drip: `https://app.gohighlevel.com/v2/location/${encodedLocationId}/automation/workflows?listTab=all`,
          };
        }
        return {
          email: 'https://app.gohighlevel.com',
          text: 'https://app.gohighlevel.com',
          drip: 'https://app.gohighlevel.com',
        };
      },
      getCampaignHubUrl(locationId) {
        if (locationId) {
          return `https://app.gohighlevel.com/location/${locationId}/campaigns`;
        }
        return 'https://app.gohighlevel.com';
      },
      getCampaignEditUrl(params) {
        if (!params.locationId || !params.editId) return null;
        return `https://app.gohighlevel.com/location/${params.locationId}/emails/campaigns/create/${params.editId}`;
      },
      getCampaignStatsUrl(params) {
        if (!params.locationId || !params.scheduleId) return null;
        const base = `https://app.gohighlevel.com/v2/location/${params.locationId}/marketing/emails/campaigns/${params.scheduleId}/statistics`;
        const query = new URLSearchParams({ tabIndex: '0', pageNumber: '1' });
        if (params.bulkRequestId) query.set('bulkReqId', params.bulkRequestId);
        if (params.folderId) query.set('folderId', params.folderId);
        return `${base}?${query.toString()}`;
      },
      getWorkflowHubUrl(locationId) {
        if (locationId) {
          return `https://app.gohighlevel.com/location/${locationId}/workflows`;
        }
        return 'https://app.gohighlevel.com';
      },
      getWorkflowEditUrl(params) {
        if (!params.locationId || !params.workflowId) return null;
        return `https://app.gohighlevel.com/location/${params.locationId}/workflow/${params.workflowId}`;
      },
    },
  },
  klaviyo: {
    displayName: 'Klaviyo',
    description: 'Email marketing, automation flows, and customer data for ecommerce.',
    logoSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d29f6bac245308bb6556.png',
    logoAlt: 'Klaviyo',
    iconSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3ac3b3cc9155bdaf06e.png',
    iconAlt: 'Klaviyo',
    headerClassName: 'bg-white',
    connectButtonClassName: 'bg-black text-white hover:bg-neutral-800',
    portalLinks: {
      getCampaignCreateLinks() {
        return {
          email: 'https://www.klaviyo.com/campaigns',
          text: 'https://www.klaviyo.com/campaigns',
          drip: 'https://www.klaviyo.com/flows',
        };
      },
      getCampaignHubUrl() {
        return 'https://www.klaviyo.com/campaigns';
      },
      getCampaignEditUrl() {
        return 'https://www.klaviyo.com/campaigns';
      },
      getCampaignStatsUrl() {
        return null;
      },
      getWorkflowHubUrl() {
        return 'https://www.klaviyo.com/flows';
      },
      getWorkflowEditUrl() {
        return 'https://www.klaviyo.com/flows';
      },
    },
  },
};

export function normalizeProvider(provider: string | null | undefined): string {
  return (provider || '').trim().toLowerCase();
}

export function titleCaseProvider(provider: string): string {
  return provider
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getProviderConfig(provider: string | null | undefined): EspProviderConfig | undefined {
  return ESP_PROVIDER_CONFIG[normalizeProvider(provider)];
}

export function providerDisplayName(provider: string | null | undefined): string {
  const normalized = normalizeProvider(provider);
  if (!normalized) return 'ESP';
  return getProviderConfig(normalized)?.displayName || titleCaseProvider(normalized);
}
