import {
  getProviderConfig,
  type CampaignCreateLinks as ProviderCampaignCreateLinks,
} from '@/lib/esp/provider-config';

export type CampaignCreateLinks = ProviderCampaignCreateLinks;

type CampaignStatsParamsInput = {
  provider: string | null | undefined;
  locationId?: string | null;
  scheduleId?: string | null;
  bulkRequestId?: string | null;
  folderId?: string | null;
};

type WorkflowEditParamsInput = {
  provider: string | null | undefined;
  locationId?: string | null;
  workflowId?: string | null;
};

type CampaignEditParamsInput = {
  provider: string | null | undefined;
  locationId?: string | null;
  editId?: string | null;
};

function getProviderPortalLinks(provider: string | null | undefined) {
  return getProviderConfig(provider)?.portalLinks || null;
}

export function getCampaignCreateLinks(
  provider: string | null | undefined,
  locationId?: string | null,
): CampaignCreateLinks {
  const links = getProviderPortalLinks(provider);
  return links ? links.getCampaignCreateLinks(locationId) : { email: null, text: null, drip: null };
}

export function getCampaignHubUrl(
  provider: string | null | undefined,
  locationId?: string | null,
): string | null {
  return getProviderPortalLinks(provider)?.getCampaignHubUrl(locationId) || null;
}

export function getCampaignEditUrl(params: {
  provider: string | null | undefined;
  locationId?: string | null;
  editId?: string | null;
}): string | null {
  const payload: CampaignEditParamsInput = params;
  return getProviderPortalLinks(payload.provider)?.getCampaignEditUrl(payload) || null;
}

export function getCampaignStatsUrl(params: {
  provider: string | null | undefined;
  locationId?: string | null;
  scheduleId?: string | null;
  bulkRequestId?: string | null;
  folderId?: string | null;
}): string | null {
  const payload: CampaignStatsParamsInput = params;
  return getProviderPortalLinks(payload.provider)?.getCampaignStatsUrl(payload) || null;
}

export function getWorkflowHubUrl(
  provider: string | null | undefined,
  locationId?: string | null,
): string | null {
  return getProviderPortalLinks(provider)?.getWorkflowHubUrl(locationId) || null;
}

export function getWorkflowEditUrl(params: {
  provider: string | null | undefined;
  locationId?: string | null;
  workflowId?: string | null;
}): string | null {
  const payload: WorkflowEditParamsInput = params;
  return getProviderPortalLinks(payload.provider)?.getWorkflowEditUrl(payload) || null;
}
