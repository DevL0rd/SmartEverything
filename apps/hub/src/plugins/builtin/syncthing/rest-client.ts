import type { FetchLike } from '../fetch-like';
import { JsonApi } from '../json-api';

const REQUEST_TIMEOUT_MS = 15_000;

export class SyncthingRest extends JsonApi {
  constructor(baseUrl: string, apiKey: string, fetcher?: FetchLike) {
    super({
      service: 'Syncthing',
      baseUrl,
      headers: { 'X-API-Key': apiKey },
      refusal: 'Syncthing rejected the API key',
      timeoutMs: REQUEST_TIMEOUT_MS,
      fetcher,
    });
  }
}
