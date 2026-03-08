export function shouldFallbackToS3Media(
  status: number,
  message: string | null | undefined,
) {
  const normalized = String(message || '').toLowerCase();

  return (
    (status === 404 &&
      normalized.includes('esp not connected for this account')) ||
    (status === 501 &&
      normalized.includes('does not currently support media'))
  );
}
