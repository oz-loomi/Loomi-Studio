/**
 * Normalizes account API field aliases between UI naming and DB naming.
 *
 * DB columns use: salesPhone/servicePhone/partsPhone
 * UI payloads historically used: phoneSales/phoneService/phoneParts
 */
export function normalizeAccountInputAliases(payload: Record<string, unknown>): void {
  if (!('salesPhone' in payload) && 'phoneSales' in payload) {
    payload.salesPhone = payload.phoneSales;
  }
  if (!('servicePhone' in payload) && 'phoneService' in payload) {
    payload.servicePhone = payload.phoneService;
  }
  if (!('partsPhone' in payload) && 'phoneParts' in payload) {
    payload.partsPhone = payload.phoneParts;
  }
}

/**
 * Adds UI-compatible aliases to account response payloads.
 */
export function applyAccountOutputAliases(payload: Record<string, unknown>): void {
  if (!('phoneSales' in payload) && typeof payload.salesPhone === 'string') {
    payload.phoneSales = payload.salesPhone;
  }
  if (!('phoneService' in payload) && typeof payload.servicePhone === 'string') {
    payload.phoneService = payload.servicePhone;
  }
  if (!('phoneParts' in payload) && typeof payload.partsPhone === 'string') {
    payload.phoneParts = payload.partsPhone;
  }
}
