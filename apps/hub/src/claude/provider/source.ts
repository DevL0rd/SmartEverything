import { randomUUID } from 'node:crypto';
import type { JsonValue } from '@smarteverything/domain';
export class ProviderSource {
  readonly generation = randomUUID();
  private sequence = 0;
  record(payload: Record<string, JsonValue>, cwd: string): Record<string, JsonValue> {
    this.sequence += 1;
    return {
      ...payload,
      _source_generation: this.generation,
      _source_sequence: this.sequence,
      _source_cwd: cwd,
    };
  }
}
