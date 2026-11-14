// UK postcodes and delivery zones.

export interface ParsedPostcode {
  /** For example "ME14". */
  outward: string;
  /** For example "1AA". */
  inward: string;
  /** For example "ME14 1AA". */
  formatted: string;
}

const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;

/** Reads a full UK postcode however it was typed, or returns null. */
export function parsePostcode(input: string): ParsedPostcode | null {
  const match = POSTCODE.exec(input.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  if (!match) return null;
  return { outward: match[1]!, inward: match[2]!, formatted: `${match[1]} ${match[2]}` };
}

export interface ZoneRule {
  id: string;
  name: string;
  /** Outward codes, for example ["ME14", "ME15"]. */
  postcodePrefixes: string[];
  feePence: number;
  minOrderPence: number;
  isActive: boolean;
  sortOrder: number;
}

/** The first active zone that covers a postcode, or null. */
export function findZone<T extends ZoneRule>(zones: T[], postcode: string): T | null {
  const parsed = parsePostcode(postcode);
  if (!parsed) return null;
  return (
    [...zones]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .find(
        (zone) =>
          zone.isActive &&
          zone.postcodePrefixes.some(
            (prefix) => prefix.toUpperCase().replace(/\s/g, '') === parsed.outward,
          ),
      ) ?? null
  );
}
