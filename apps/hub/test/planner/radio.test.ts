import { describe, expect, it } from 'vitest';
import { RadioDirectory } from '../../src/planner/radio';

interface Fake {
  readonly requested: string[];
  readonly directory: RadioDirectory;
}

function fakeDirectory(
  answers: Record<string, () => Response>,
  mirrors: readonly string[] = ['a.test', 'b.test'],
): Fake {
  const requested: string[] = [];
  const directory = new RadioDirectory({
    version: 't',
    fetch: (input): Promise<Response> => {
      const url = new Request(input).url;
      requested.push(url);
      if (url.endsWith('/json/servers')) {
        return Promise.resolve(Response.json(mirrors.map((name) => ({ name }))));
      }
      const host = new URL(url).host;
      const answer = answers[host];
      return Promise.resolve(answer === undefined ? new Response('', { status: 500 }) : answer());
    },
  });
  return { requested, directory };
}

const STATION = {
  stationuuid: '598c4d0e-6b06-43fb-bff4-717c591213a9',
  name: ' BBC World Service ',
  url_resolved: 'https://stream.example.test/world',
  country: 'The United Kingdom',
  bitrate: 56,
  codec: 'MP3',
};

function stations(...rows: Record<string, unknown>[]): () => Response {
  return () => Response.json(rows);
}

describe('the radio directory', () => {
  it('searches by name on a mirror and maps the stations', async () => {
    const { directory, requested } = fakeDirectory({
      'a.test': stations(STATION),
      'b.test': stations(STATION),
    });
    const found = await directory.search('bbc');
    expect(found).toEqual([
      {
        station_id: STATION.stationuuid,
        name: 'BBC World Service',
        url: STATION.url_resolved,
        country: 'The United Kingdom',
        bitrate: 56,
        codec: 'MP3',
      },
    ]);
    const search = new URL(requested.at(-1) ?? '');
    expect(search.pathname).toBe('/json/stations/search');
    expect(search.searchParams.get('name')).toBe('bbc');
    expect(search.searchParams.get('hidebroken')).toBe('true');
    expect(search.searchParams.get('hls')).toBe('false');
  });

  it('turns unknown fields into null and drops stations it cannot play', async () => {
    const { directory } = fakeDirectory(
      {
        'a.test': stations(
          { ...STATION, country: ' ', bitrate: 0, codec: '' },
          { ...STATION, stationuuid: 'other', url_resolved: 'rtsp://stream.example.test/x' },
          { ...STATION, stationuuid: 'unnamed', name: ' ' },
        ),
      },
      ['a.test'],
    );
    expect(await directory.search('bbc')).toEqual([
      expect.objectContaining({ country: null, bitrate: null, codec: null }),
    ]);
  });

  it('tries the next mirror when one fails', async () => {
    const { directory, requested } = fakeDirectory({ 'b.test': stations(STATION) });
    const found = await directory.search('bbc');
    expect(found).toHaveLength(1);
    expect(
      requested.filter((url) => url.includes('/stations/search')).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('refuses with an upstream failure when every mirror fails', async () => {
    const { directory } = fakeDirectory({});
    await expect(directory.search('bbc')).rejects.toMatchObject({ code: 'upstream_failed' });
  });

  it('refuses an answer it cannot read', async () => {
    const { directory } = fakeDirectory({ 'a.test': () => Response.json({ nope: true }) }, [
      'a.test',
    ]);
    await expect(directory.search('bbc')).rejects.toMatchObject({ code: 'upstream_failed' });
  });
});
