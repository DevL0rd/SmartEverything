import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import {
  CAPABILITY_DEFINITION,
  definitionKey,
  definitionPath,
  type CapabilityDefinition,
} from '@smarteverything/smartthings';
import type { SmartThingsApi } from './http';

function isMissingFile(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

export class DefinitionCache {
  private readonly memory = new Map<string, CapabilityDefinition>();
  private readonly directory: string;

  constructor(
    private readonly api: SmartThingsApi,
    dataDirectory: string,
    private readonly log: Logger,
  ) {
    this.directory = join(dataDirectory, 'capabilities');
  }

  async load(
    references: readonly { readonly id: string; readonly version: number }[],
  ): Promise<ReadonlyMap<string, CapabilityDefinition>> {
    for (const reference of references) {
      const key = definitionKey(reference.id, reference.version);
      if (!this.memory.has(key)) {
        const definition =
          (await this.fromDisk(key)) ?? (await this.fromApi(reference.id, reference.version));
        if (definition !== null) {
          this.memory.set(key, definition);
        }
      }
    }
    return this.memory;
  }

  private fileOf(key: string): string {
    return join(this.directory, `${encodeURIComponent(key)}.json`);
  }

  private async fromDisk(key: string): Promise<CapabilityDefinition | null> {
    let text: string;
    try {
      text = await readFile(this.fileOf(key), 'utf8');
    } catch (cause) {
      if (isMissingFile(cause)) {
        return null;
      }
      throw cause;
    }
    return CAPABILITY_DEFINITION.parse(JSON.parse(text));
  }

  private async fromApi(id: string, version: number): Promise<CapabilityDefinition | null> {
    let body: unknown;
    try {
      body = await this.api.request({ method: 'GET', path: definitionPath(id, version) });
    } catch (cause) {
      this.log.warn('capability.definition_unavailable', {
        capability: id,
        version,
        reason: String(cause),
      });
      return null;
    }
    const definition = CAPABILITY_DEFINITION.parse(body);
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.fileOf(definitionKey(id, version)), JSON.stringify(definition), 'utf8');
    return definition;
  }
}
