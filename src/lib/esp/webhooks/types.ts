import type { NextRequest, NextResponse } from 'next/server';

export type ProviderWebhookFamilyHandler = {
  get(params: { provider: string; endpoint: string }): Promise<NextResponse> | NextResponse;
  post(req: NextRequest, params: { provider: string }): Promise<NextResponse> | NextResponse;
};

export type ProviderWebhookFamilyMap = Record<string, ProviderWebhookFamilyHandler>;

export type EmailStatsWebhookHandler = ProviderWebhookFamilyHandler;
