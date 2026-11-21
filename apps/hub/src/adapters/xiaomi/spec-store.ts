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
import { z } from 'zod';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import { cachedJson, refreshJson } from '../../fs-util';
import { failureLine } from '@smarteverything/logging';

const INDEX_FILE = 'miot-spec-index.json';
const SPEC_DIRECTORY = 'miot-specs';
const FIRMWARE_FILE = 'miot-spec-firmware.json';
const FIRMWARE_VERSIONS = z.record(z.string(), z.string());
const MIIO_INFO = z.object({ fw_ver: z.string().min(1) });

export interface SpecDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

export function firmwareFromMiioInfo(reply: unknown): string | null {
  const parsed = MIIO_INFO.safeParse(reply);
  return parsed.success ? parsed.data.fw_ver : null;
}

function entrySignatures(spec: MiotSpec): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const service of spec.services) {
    entries.set(String(service.iid), service.type);
    for (const property of service.properties) {
      entries.set(`${String(service.iid)}.p${String(property.iid)}`, JSON.stringify(property));
    }
    for (const action of service.actions) {
      entries.set(`${String(service.iid)}.a${String(action.iid)}`, JSON.stringify(action));
    }
    for (const event of service.events) {
      entries.set(`${String(service.iid)}.e${String(event.iid)}`, JSON.stringify(event));
    }
  }
  return entries;
}

export function diffSpecs(before: MiotSpec, after: MiotSpec): SpecDiff {
  const old = entrySignatures(before);
  const next = entrySignatures(after);
  return {
    added: [...next.keys()].filter((key) => !old.has(key)),
    removed: [...old.keys()].filter((key) => !next.has(key)),
    changed: [...next.keys()].filter((key) => old.has(key) && old.get(key) !== next.get(key)),
  };
}

export interface SpecStoreOptions {
  readonly fetch: FetchLike;
  readonly baseUrl: string;
  readonly directory: string;
  readonly log: Logger;
}

export class SpecStore {
  private index: Promise<MiotSpecIndex> | null = null;
  private indexFetched = false;
  private firmwares: Promise<Map<string, string>> | null = null;
  private readonly reading = new Map<string, Promise<MiotSpec>>();

  constructor(private readonly options: SpecStoreOptions) {}

  async specFor(
    model: string,
    reportedType: string | null,
    firmware: string | null = null,
  ): Promise<MiotSpec> {
    const type = reportedType ?? (await this.typeFor(model));
    const file = join(this.options.directory, SPEC_DIRECTORY, `${encodeURIComponent(type)}.json`);
    const url = `${this.options.baseUrl}/miot-spec-v2/instance?type=${encodeURIComponent(type)}`;
    const stored = await this.storedSpec(file, url);
    if (firmware === null) {
      return stored;
    }
    const previous = (await this.firmwareVersions()).get(model);
    if (previous === firmware) {
      return stored;
    }
    if (previous === undefined) {
      await this.rememberFirmware(model, firmware);
      return stored;
    }
    return this.refreshed({ model, from: previous, to: firmware }, stored, file, url);
  }

  private async refreshed(
    change: { readonly model: string; readonly from: string; readonly to: string },
    stored: MiotSpec,
    file: string,
    url: string,
  ): Promise<MiotSpec> {
    let fresh: MiotSpec;
    try {
      fresh = await this.download(file, url, MIOT_SPEC);
    } catch (cause) {
      this.options.log.warn('miot_spec.refresh_failed', {
        ...change,
        reason: failureLine(cause),
      });
      return stored;
    }
    await this.rememberFirmware(change.model, change.to);
    this.options.log.info('miot_spec.firmware_changed', {
      ...change,
      diff: diffSpecs(stored, fresh),
    });
    return fresh;
  }

  private storedSpec(file: string, url: string): Promise<MiotSpec> {
    const inFlight = this.reading.get(file);
    if (inFlight !== undefined) return inFlight;
    const read = this.cached(file, url, MIOT_SPEC).finally(() => {
      this.reading.delete(file);
    });
    this.reading.set(file, read);
    return read;
  }

  private firmwareVersions(): Promise<Map<string, string>> {
    this.firmwares ??= cachedJson(
      join(this.options.directory, FIRMWARE_FILE),
      FIRMWARE_VERSIONS,
      () => Promise.resolve({}),
      (cause) => {
        this.options.log.warn('miot_spec.cache_unreadable', {
          file: FIRMWARE_FILE,
          reason: failureLine(cause),
        });
      },
    )
      .then((versions) => new Map(Object.entries(versions)))
      .catch((cause: unknown) => {
        this.firmwares = null;
        throw cause;
      });
    return this.firmwares;
  }

  private async rememberFirmware(model: string, firmware: string): Promise<void> {
    const versions = await this.firmwareVersions();
    versions.set(model, firmware);
    await refreshJson(join(this.options.directory, FIRMWARE_FILE), FIRMWARE_VERSIONS, () =>
      Promise.resolve(Object.fromEntries(versions)),
    );
  }

  private async typeFor(model: string): Promise<string> {
    const loading = (this.index ??= this.indexLoad(() =>
      this.cached(join(this.options.directory, INDEX_FILE), this.indexUrl(), MIOT_SPEC_INDEX),
    ));
    const known = specTypeForModel(await loading, model);
    if (known !== null) {
      return known;
    }
    if (this.index !== loading) {
      return this.typeFor(model);
    }
    if (!this.indexFetched) {
      this.index = this.indexLoad(() =>
        this.download(join(this.options.directory, INDEX_FILE), this.indexUrl(), MIOT_SPEC_INDEX),
      );
      return this.typeFor(model);
    }
    throw new MiotSpecError(model, 'a released MIoT spec for this model on miot-spec.org', 'none');
  }

  private indexLoad(load: () => Promise<MiotSpecIndex>): Promise<MiotSpecIndex> {
    const loading: Promise<MiotSpecIndex> = load().catch((cause: unknown) => {
      if (this.index === loading) this.index = null;
      throw cause;
    });
    return loading;
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
