import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PlaceFinder } from '../../src/places/place-finder';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';

interface Setup {
  readonly search?: unknown;
  readonly reverse?: unknown;
  readonly zone?: unknown;
  readonly status?: number;
}

function finderWith(setup: Setup): { finder: PlaceFinder; urls: URL[] } {
  const urls: URL[] = [];
  const finder = new PlaceFinder({
    request: {
      fetch: (input): Promise<Response> => {
        const url = new URL(new Request(input).url);
        urls.push(url);
        if (setup.status !== undefined) {
          return Promise.resolve(new Response('{}', { status: setup.status }));
        }
        if (url.hostname.startsWith('geocoding')) {
          return Promise.resolve(Response.json(setup.search ?? {}));
        }
        if (url.hostname.startsWith('nominatim')) {
          return Promise.resolve(Response.json(setup.reverse ?? {}));
        }
        return Promise.resolve(Response.json(setup.zone ?? { timezone: 'UTC' }));
      },
      version: 't',
    },
    clock: new FakeClock('2026-10-10T09:00:00.000Z'),
    log: testLogger('places'),
  });
  return { finder, urls };
}

function hit(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, latitude: 1, longitude: 2, ...extra };
}

describe('PlaceFinder.search', () => {
  it('asks Open-Meteo for more than wanted, since it filters the answers itself', async () => {
    const { finder, urls } = finderWith({ search: { results: [] } });
    await finder.search('Oslo', 3);
    expect(urls[0]?.searchParams.get('name')).toBe('Oslo');
    expect(urls[0]?.searchParams.get('count')).toBe('12');
    await finder.search('Oslo', 50);
    expect(urls[1]?.searchParams.get('count')).toBe('40');
  });

  it('returns places with region, country and time zone, or null where the provider gave none', async () => {
    const { finder } = finderWith({
      search: {
        results: [
          hit('Oslo', {
            admin1: 'Oslo',
            country: 'Norway',
            country_code: 'NO',
            timezone: 'Europe/Oslo',
            latitude: 59.9,
            longitude: 10.7,
          }),
          hit('Osloby'),
        ],
      },
    });
    expect(await finder.search('Oslo', 5)).toEqual([
      {
        name: 'Oslo',
        region: 'Oslo',
        country: 'Norway',
        countryCode: 'NO',
        latitude: 59.9,
        longitude: 10.7,
        timeZone: 'Europe/Oslo',
      },
      {
        name: 'Osloby',
        region: null,
        country: null,
        countryCode: null,
        latitude: 1,
        longitude: 2,
        timeZone: null,
      },
    ]);
  });

  it('keeps names that start with the query or hold it as a word, ignoring accents and case', async () => {
    const { finder } = finderWith({
      search: {
        results: [
          hit('Zürich'),
          hit('New York'),
          hit('Winston-Salem'),
          hit('Newark'),
          hit('Bunyork'),
        ],
      },
    });
    expect((await finder.search('zurich', 10)).map((place) => place.name)).toEqual(['Zürich']);
    expect((await finder.search('york', 10)).map((place) => place.name)).toEqual(['New York']);
    expect((await finder.search('salem', 10)).map((place) => place.name)).toEqual([
      'Winston-Salem',
    ]);
    expect((await finder.search('new', 10)).map((place) => place.name)).toEqual([
      'New York',
      'Newark',
    ]);
  });

  it('drops repeats of the same name, region and country and stops at the count', async () => {
    const { finder } = finderWith({
      search: {
        results: [
          hit('Paris', { admin1: 'Île-de-France', country: 'France' }),
          hit('Paris', { admin1: 'Île-de-France', country: 'France' }),
          hit('Paris', { admin1: 'Texas', country: 'United States' }),
          hit('Paris', { admin1: 'Ontario', country: 'Canada' }),
        ],
      },
    });
    const places = await finder.search('paris', 2);
    expect(places.map((place) => place.region)).toEqual(['Île-de-France', 'Texas']);
  });

  it('gives an empty list when the provider found nothing', async () => {
    const { finder } = finderWith({ search: {} });
    expect(await finder.search('nowhere', 3)).toEqual([]);
  });

  it('turns a provider failure into an upstream error naming the provider', async () => {
    const { finder } = finderWith({ status: 500 });
    const failure = await finder.search('Oslo', 3).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure instanceof Error ? failure.message : '').toContain('Open-Meteo');
  });
});

describe('PlaceFinder.locate answers', () => {
  it('names the nearest settlement in the order city, town, village, municipality, county, state', async () => {
    const order = [
      { city: 'A', town: 'B', village: 'C', municipality: 'D', county: 'E', state: 'F' },
      { town: 'B', village: 'C', municipality: 'D', county: 'E', state: 'F' },
      { village: 'C', municipality: 'D', county: 'E', state: 'F' },
      { municipality: 'D', county: 'E', state: 'F' },
      { county: 'E', state: 'F' },
      { state: 'F' },
    ];
    const names: string[] = [];
    for (const address of order) {
      const { finder } = finderWith({ reverse: { address } });
      names.push((await finder.locate(1, 2)).name);
    }
    expect(names).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('returns the region, the upper-case country code and the time zone at the position', async () => {
    const { finder } = finderWith({
      reverse: {
        address: { city: 'Oslo', state: 'Oslo', country: 'Norway', country_code: 'no' },
      },
      zone: { timezone: 'Europe/Oslo' },
    });
    expect(await finder.locate(59.9, 10.7)).toEqual({
      name: 'Oslo',
      region: 'Oslo',
      country: 'Norway',
      countryCode: 'NO',
      latitude: 59.9,
      longitude: 10.7,
      timeZone: 'Europe/Oslo',
    });
  });

  it('uses the province when the address has no state', async () => {
    const { finder } = finderWith({ reverse: { address: { city: 'Turin', province: 'Torino' } } });
    expect((await finder.locate(45, 7)).region).toBe('Torino');
  });

  it('says nothing was found when the position has no town or city', async () => {
    const { finder } = finderWith({ reverse: { address: { country: 'Norway' } } });
    const failure = await finder.locate(0, 0).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure instanceof Error ? failure.message : '').toContain('Search for it instead');
    const empty = finderWith({ reverse: {} });
    await expect(empty.finder.locate(0, 0)).rejects.toThrow('No town or city');
  });

  it('turns a provider failure into an upstream error', async () => {
    const { finder } = finderWith({ status: 503 });
    await expect(finder.locate(1, 2)).rejects.toBeInstanceOf(ApiError);
  });
});
