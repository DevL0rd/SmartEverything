import { describe, expect, it } from 'vitest';
import { PlaceFinder } from '../../src/places/place-finder';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';

function finderWith(clock: FakeClock, failing = false): { finder: PlaceFinder; starts: number[] } {
  const starts: number[] = [];
  const finder = new PlaceFinder({
    request: {
      fetch: (input): Promise<Response> => {
        const url = new Request(input).url;
        if (url.includes('nominatim')) {
          starts.push(clock.now().getTime());
          return Promise.resolve(
            failing
              ? new Response('{}', { status: 503 })
              : Response.json({ address: { city: 'Oslo', country: 'Norway', country_code: 'no' } }),
          );
        }
        return Promise.resolve(Response.json({ timezone: 'Europe/Oslo' }));
      },
      version: 't',
    },
    clock,
    log: testLogger('places'),
  });
  return { finder, starts };
}

describe('PlaceFinder.locate', () => {
  it('lets a second lookup 100 ms after the first wait for Nominatim instead of refusing', async () => {
    const clock = new FakeClock('2026-10-10T09:00:00.000Z');
    const { finder } = finderWith(clock);
    expect((await finder.locate(59.9, 10.7)).name).toBe('Oslo');
    clock.advanceTo('2026-10-10T09:00:00.100Z');
    expect((await finder.locate(59.9, 10.7)).name).toBe('Oslo');
    expect(clock.sleeps).toStrictEqual([1000]);
  });

  it('serves lookups started together one after another', async () => {
    const clock = new FakeClock('2026-10-10T09:00:00.000Z');
    const { finder, starts } = finderWith(clock);
    const places = await Promise.all([
      finder.locate(59.9, 10.7),
      finder.locate(59.9, 10.7),
      finder.locate(59.9, 10.7),
    ]);
    expect(places.map((place) => place.name)).toStrictEqual(['Oslo', 'Oslo', 'Oslo']);
    expect(starts).toHaveLength(3);
    expect(clock.sleeps).toStrictEqual([1100, 1100]);
  });

  it('does not wait when the last lookup was over a second ago', async () => {
    const clock = new FakeClock('2026-10-10T09:00:00.000Z');
    const { finder } = finderWith(clock);
    await finder.locate(59.9, 10.7);
    clock.advanceTo('2026-10-10T09:00:05.000Z');
    await finder.locate(59.9, 10.7);
    expect(clock.sleeps).toStrictEqual([]);
  });

  it('answers the lookup after one that failed', async () => {
    const clock = new FakeClock('2026-10-10T09:00:00.000Z');
    const broken = finderWith(clock, true);
    const attempts = await Promise.allSettled([
      broken.finder.locate(59.9, 10.7),
      broken.finder.locate(59.9, 10.7),
    ]);
    expect(attempts.map((attempt) => attempt.status)).toStrictEqual(['rejected', 'rejected']);
    expect(broken.starts).toHaveLength(2);
  });
});
