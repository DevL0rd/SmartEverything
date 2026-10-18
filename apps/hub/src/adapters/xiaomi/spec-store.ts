import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import {
  MIOT_SPEC,
  MIOT_SPEC_INDEX,
  MiotSpecError,
  specTypeForModel,
  type MiotSpec,
  type MiotSpecIndex,
} from '@smarteverything/xiaomi';
import type { z } from 'zod';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import { cachedJson, refreshJson } from '../../fs-util';
import { failureLine } from '@smarteverything/logging';

const INDEX_FILE = 'miot-spec-index.json';
const SPEC_DIRECTORY = 'miot-specs';

export interface SpecStoreOptions {
  readonly fetch: FetchLike;
  readonly baseUrl: string;
  readonly directory: string;
  readonly log: Logger;
}

export class SpecStore {
  private index: MiotSpecIndex | null = null;
  private indexFetched = false;

  constructor(private readonly options: SpecStoreOptions) {}

  async specFor(model: string, reportedType: string | null): Promise<MiotSpec> {
    const type = reportedType ?? (await this.typeFor(model));
    const file = join(this.options.directory, SPEC_DIRECTORY, `${encodeURIComponent(type)}.json`);
    const url = `${this.options.baseUrl}/miot-spec-v2/instance?type=${encodeURIComponent(type)}`;
    return this.cached(file, url, MIOT_SPEC);
  }

  private async typeFor(model: string): Promise<string> {
    this.index ??= await this.cached(
      join(this.options.directory, INDEX_FILE),
      this.indexUrl(),
      MIOT_SPEC_INDEX,
    );
    const known = specTypeForModel(this.index, model);
    if (known !== null) {
      return known;
    }
    if (!this.indexFetched) {
      this.index = await this.download(
        join(this.options.directory, INDEX_FILE),
        this.indexUrl(),
        MIOT_SPEC_INDEX,
      );
      return this.typeFor(model);
    }
    throw new MiotSpecError(model, 'a released MIoT spec for this model on miot-spec.org', 'none');
  }

  private indexUrl(): string {
    return `${this.options.baseUrl}/miot-spec-v2/instances?status=released`;
  }

  private cached<T>(file: string, url: string, schema: z.ZodType<T>): Promise<T> {
    return cachedJson(
      file,
      schema,
      () => this.fetchJson(file, url),
      (cause) => {
        this.options.log.warn('miot_spec.cache_unreadable', { file, reason: failureLine(cause) });
      },
    );
  }

  private download<T>(file: string, url: string, schema: z.ZodType<T>): Promise<T> {
    return refreshJson(file, schema, () => this.fetchJson(file, url));
  }

  private async fetchJson(file: string, url: string): Promise<unknown> {
    if (file.endsWith(INDEX_FILE)) {
      this.indexFetched = true;
    }
    const response = await this.options.fetch(url, { method: 'GET' });
    if (response.status !== 200) {
      throw new MiotSpecError(url, 'HTTP 200', `HTTP ${String(response.status)}`);
    }
    const body: unknown = await response.json();
    this.options.log.info('miot_spec.cached', { url });
    return body;
  }
}
