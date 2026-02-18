import '@/lib/esp/init';

import { getAdapter, getAccountProvider } from '@/lib/esp/registry';
import {
  parseEspProvider,
  providerValidationMessage,
} from '@/lib/esp/provider-utils';
import type {
  EspValidationInput,
  EspValidationResult,
} from '@/lib/esp/types';
import { EspValidationError } from '@/lib/esp/types';

type ValidateInput = EspValidationInput & {
  provider?: string;
};

type ValidateSuccess = {
  ok: true;
} & EspValidationResult;

type ValidateFailure = {
  ok: false;
  error: string;
  status: number;
};

export type ValidateConnectionResult = ValidateSuccess | ValidateFailure;

export async function validateEspConnection(input: ValidateInput): Promise<ValidateConnectionResult> {
  let provider = parseEspProvider(input.provider);
  const accountKey = input.accountKey?.trim() || '';
  if (!provider && accountKey) {
    try {
      provider = await getAccountProvider(accountKey);
    } catch {
      provider = null;
    }
  }

  if (!provider) {
    return { ok: false, error: providerValidationMessage(), status: 400 };
  }

  let adapter;
  try {
    adapter = getAdapter(provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : `Provider "${provider}" is not registered`;
    return { ok: false, error: message, status: 400 };
  }

  if (!adapter.validation) {
    return {
      ok: false,
      error: `Validation flow not implemented for provider "${provider}"`,
      status: 501,
    };
  }

  try {
    const result = await adapter.validation.validate(input);
    return {
      ok: true,
      ...result,
      provider: result.provider || adapter.provider,
    };
  } catch (err) {
    if (err instanceof EspValidationError) {
      return { ok: false, error: err.message, status: err.status };
    }
    const message = err instanceof Error ? err.message : 'Failed to validate credentials';
    return { ok: false, error: message, status: 500 };
  }
}
