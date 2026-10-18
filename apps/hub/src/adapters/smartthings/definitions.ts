import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import {
  CAPABILITY_DEFINITION,
  definitionKey,
  definitionPath,
  type CapabilityDefinition,
} from '@smarteverything/smartthings';
import type { SmartThingsApi } from './http';
import { cachedJson } from '../../fs-util';
import { failureLine, messageOf } from '@smarteverything/logging';

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
        const definition = await this.definitionOf(reference.id, reference.version);
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

  private async definitionOf(id: string, version: number): Promise<CapabilityDefinition | null> {
    try {
      return await cachedJson(
        this.fileOf(definitionKey(id, version)),
        CAPABILITY_DEFINITION,
        () => this.api.request({ method: 'GET', path: definitionPath(id, version) }),
        (cause) => {
          this.log.warn('capability.definition_cache_unreadable', {
            capability: id,
            version,
            reason: messageOf(cause),
          });
        },
      );
    } catch (cause) {
      this.log.warn('capability.definition_unavailable', {
        capability: id,
        version,
        reason: failureLine(cause),
      });
      return null;
    }
  }
}
