import { ApiError, type PlannerRadioResult } from '@smarteverything/domain';
import { z } from 'zod';
import { ProviderError, fetchJson, type ProviderRequest } from '../outbound/provider-json';

const PROVIDER = 'Radio Browser';

const DISCOVERY_HOST = 'https://de1.api.radio-browser.info';

const RESULT_LIMIT = 30;

const SERVERS = z.array(z.object({ name: z.string().min(1) }));

const STATIONS = z.array(
  z.object({
    stationuuid: z.string().min(1),
    name: z.string(),
    url_resolved: z.string(),
    country: z.string(),
    bitrate: z.number(),
    codec: z.string(),
  }),
);

type Station = z.infer<typeof STATIONS>[number];

function playable(address: string): boolean {
  return URL.canParse(address) && /^https?:$/.test(new URL(address).protocol);
}

function resultOf(station: Station): PlannerRadioResult | null {
  const name = station.name.trim();
  if (name === '' || !playable(station.url_resolved)) {
    return null;
  }
  return {
    station_id: station.stationuuid,
    name,
    url: station.url_resolved,
    country: station.country.trim() === '' ? null : station.country.trim(),
    bitrate: station.bitrate > 0 ? Math.round(station.bitrate) : null,
    codec: station.codec.trim() === '' ? null : station.codec.trim(),
  };
}

function shuffled<T>(items: readonly T[]): T[] {
  return items
    .map((item) => ({ item, key: Math.random() }))
    .sort((left, right) => left.key - right.key)
    .map(({ item }) => item);
}

export class RadioDirectory {
  private servers: readonly string[] | null = null;

  constructor(private readonly request: ProviderRequest) {}

  async search(text: string): Promise<PlannerRadioResult[]> {
    try {
      return await this.searchAnywhere(text);
    } catch (cause) {
      throw cause instanceof ProviderError ? new ApiError('upstream_failed', cause.message) : cause;
    }
  }

  private async searchAnywhere(text: string): Promise<PlannerRadioResult[]> {
    let failure: unknown = new ProviderError(`${PROVIDER} has no server to ask.`);
    for (const host of await this.hosts()) {
      try {
        return await this.searchOn(host, text);
      } catch (cause) {
        failure = cause;
      }
    }
    throw failure;
  }

  private async searchOn(host: string, text: string): Promise<PlannerRadioResult[]> {
    const query = new URLSearchParams({
      name: text,
      limit: String(RESULT_LIMIT),
      hidebroken: 'true',
      hls: 'false',
      order: 'votes',
      reverse: 'true',
    });
    const stations = await fetchJson(
      this.request,
      PROVIDER,
      `${host}/json/stations/search?${query.toString()}`,
      STATIONS,
    );
    return stations.flatMap((station) => resultOf(station) ?? []);
  }

  private async hosts(): Promise<readonly string[]> {
    if (this.servers === null) {
      const listed = await fetchJson(
        this.request,
        PROVIDER,
        `${DISCOVERY_HOST}/json/servers`,
        SERVERS,
      );
      const names = [...new Set(listed.map((server) => server.name))];
      this.servers = names.length === 0 ? [DISCOVERY_HOST] : names.map((name) => `https://${name}`);
    }
    return shuffled(this.servers);
  }
}
