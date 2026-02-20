export const MAJOR_US_OEMS = [
  'Acura',
  'Alfa Romeo',
  'Aston Martin',
  'Audi',
  'Bentley',
  'BMW',
  'Buick',
  'Cadillac',
  'Chevrolet',
  'Chrysler',
  'Dodge',
  'Ferrari',
  'Fiat',
  'Ford',
  'Genesis',
  'GMC',
  'Honda',
  'Hyundai',
  'INFINITI',
  'Jaguar',
  'Jeep',
  'Kia',
  'Lamborghini',
  'Land Rover',
  'Lexus',
  'Lincoln',
  'Lucid',
  'Maserati',
  'Mazda',
  'McLaren',
  'Mercedes-Benz',
  'MINI',
  'Mitsubishi',
  'Nissan',
  'Polestar',
  'Porsche',
  'Ram',
  'Rivian',
  'Rolls-Royce',
  'Subaru',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
] as const;

export const POWERSPORTS_BRANDS = [
  'Arctic Cat',
  'Can-Am',
  'CFMoto',
  'Ducati',
  'Harley-Davidson',
  'Honda Powersports',
  'Husqvarna',
  'Indian Motorcycle',
  'Kawasaki',
  'KTM',
  'Polaris',
  'Royal Enfield',
  'Sea-Doo',
  'Ski-Doo',
  'Suzuki',
  'Triumph',
  'Yamaha',
] as const;

/** Industries that support brand (OEM) selection. */
export function industryHasBrands(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return normalized === 'automotive' || normalized === 'powersports';
}

/** Return the brand list for a given industry. */
export function brandsForIndustry(category: string): readonly string[] {
  const normalized = category.trim().toLowerCase();
  if (normalized === 'powersports') return POWERSPORTS_BRANDS;
  return MAJOR_US_OEMS;
}

const ALL_KNOWN_BRANDS = [...MAJOR_US_OEMS, ...POWERSPORTS_BRANDS];

const OEM_CANONICAL_BY_LOWER = new Map(
  ALL_KNOWN_BRANDS.map((oem) => [oem.toLowerCase(), oem]),
);

function splitMaybeCsv(value: string): string[] {
  if (!value.includes(',')) return [value];
  return value.split(',');
}

export function normalizeOems(rawOems?: unknown, fallbackOem?: unknown): string[] {
  const tokens: string[] = [];

  if (Array.isArray(rawOems)) {
    for (const item of rawOems) {
      if (typeof item === 'string') tokens.push(...splitMaybeCsv(item));
    }
  } else if (typeof rawOems === 'string') {
    tokens.push(...splitMaybeCsv(rawOems));
  }

  if (typeof fallbackOem === 'string') {
    tokens.push(...splitMaybeCsv(fallbackOem));
  }

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const normalized = token.trim();
    if (!normalized) continue;
    const canonical =
      OEM_CANONICAL_BY_LOWER.get(normalized.toLowerCase()) || normalized;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(canonical);
  }

  return unique;
}

export function getAccountOems(account?: {
  oems?: unknown;
  oem?: unknown;
} | null): string[] {
  if (!account) return [];
  return normalizeOems(account.oems, account.oem);
}
