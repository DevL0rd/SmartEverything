import { ApiError, PLACE, type PlaceMatch } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { ProviderError, fetchJson, readAs, type ProviderRequest } from '../outbound/provider-json';

const SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const ZONE_URL = 'https://api.open-meteo.com/v1/forecast';
const REVERSE_GAP_MS = 1100;
const OVERFETCH = 4;
const PROVIDER_MAX = 40;

const OPEN_METEO = 'Open-Meteo';
const NOMINATIM = 'OpenStreetMap';

const SEARCH_ANSWER = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
      }),
    )
    .optional(),
});

const REVERSE_ADDRESS = z.object({
  city: z.string().optional(),
  town: z.string().optional(),
  village: z.string().optional(),
  municipality: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
});

const REVERSE_ANSWER = z.object({ address: REVERSE_ADDRESS.optional() });

const ZONE_ANSWER = z.object({ timezone: z.string() });

type Address = z.infer<typeof REVERSE_ADDRESS>;

export interface PlaceFinderOptions {
  readonly request: ProviderRequest;
  readonly now: () => Date;
  readonly log: Logger;
}

function nameOf(address: Address): string | null {
  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    address.state ??
    null
  );
}

function folded(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function nameMatches(name: string, query: string): boolean {
  const wanted = folded(query);
  const words = folded(name);
  return words.startsWith(wanted) || words.includes(` ${wanted}`) || words.includes(`-${wanted}`);
}

function distinct<T extends { readonly name: string }>(
  results: readonly T[],
  keyOf: (result: T) => string,
): T[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = keyOf(result);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function asProblem(cause: unknown): never {
  if (cause instanceof ProviderError) {
    throw new ApiError('upstream_failed', cause.message);
  }
  throw cause;
}

export class PlaceFinder {
  private lastReverse = 0;

  constructor(private readonly options: PlaceFinderOptions) {}

  async search(query: string, count: number): Promise<PlaceMatch[]> {
    const url = `${SEARCH_URL}?${new URLSearchParams({
      name: query,
      count: String(Math.min(count * OVERFETCH, PROVIDER_MAX)),
      language: 'en',
      format: 'json',
    }).toString()}`;
    const answer = await fetchJson(this.options.request, OPEN_METEO, url, SEARCH_ANSWER).catch(
      asProblem,
    );
    const matching = distinct(
      (answer.results ?? []).filter((result) => nameMatches(result.name, query)),
      (result) => `${result.name}|${result.admin1 ?? ''}|${result.country ?? ''}`,
    );
    return matching.slice(0, count).map((result) =>
      readAs(OPEN_METEO, PLACE, 'place', {
        name: result.name,
        region: result.admin1 ?? null,
        country: result.country ?? null,
        countryCode: result.country_code ?? null,
        latitude: result.latitude,
        longitude: result.longitude,
        timeZone: result.timezone ?? null,
      }),
    );
  }

  async locate(latitude: number, longitude: number): Promise<PlaceMatch> {
    const [address, timeZone] = await Promise.all([
      this.reverse(latitude, longitude),
      this.zoneAt(latitude, longitude),
    ]).catch(asProblem);
    const name = nameOf(address);
    if (name === null) {
      throw new ApiError('not_found', 'No town or city was found here. Search for it instead.');
    }
    this.options.log.info('places.located', { country: address.country_code ?? null });
    return readAs(NOMINATIM, PLACE, 'place', {
      name,
      region: address.state ?? address.province ?? null,
      country: address.country ?? null,
      countryCode: address.country_code?.toUpperCase() ?? null,
      latitude,
      longitude,
      timeZone,
    });
  }

  private async reverse(latitude: number, longitude: number): Promise<Address> {
    const now = this.options.now().getTime();
    if (now - this.lastReverse < REVERSE_GAP_MS) {
      throw new ApiError('rate_limited', 'One moment, then try again.');
    }
    this.lastReverse = now;
    const url = `${REVERSE_URL}?${new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: 'jsonv2',
      zoom: '10',
      'accept-language': 'en',
    }).toString()}`;
    const answer = await fetchJson(this.options.request, NOMINATIM, url, REVERSE_ANSWER);
    return answer.address ?? {};
  }

  private async zoneAt(latitude: number, longitude: number): Promise<string> {
    const url = `${ZONE_URL}?${new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone: 'auto',
      forecast_days: '1',
      current: 'is_day',
    }).toString()}`;
    return (await fetchJson(this.options.request, OPEN_METEO, url, ZONE_ANSWER)).timezone;
  }
}
