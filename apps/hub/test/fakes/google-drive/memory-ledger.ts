import type { ImportLedger, ImportPatch, ImportRecord } from '../../../src/drive/google/ledger';
import type { ImportSource } from '../../../src/drive/google/scopes';

export class MemoryLedger implements ImportLedger {
  private readonly records = new Map<string, ImportRecord>();
  private readonly done = new Set<string>();

  insert(record: ImportRecord): void {
    this.records.set(record.id, record);
  }

  update(id: string, patch: ImportPatch): ImportRecord {
    const found = this.records.get(id);
    if (found === undefined) {
      throw new Error(`No import ${id}.`);
    }
    const next: ImportRecord = { ...found, ...patch };
    this.records.set(id, next);
    return next;
  }

  find(id: string): ImportRecord | undefined {
    return this.records.get(id);
  }

  latestOf(profileId: string): ImportRecord | undefined {
    return [...this.records.values()].filter((record) => record.profileId === profileId).at(-1);
  }

  unfinished(): readonly ImportRecord[] {
    return [...this.records.values()].filter(
      (record) => record.state === 'running' || record.state === 'awaiting_consent',
    );
  }

  markDone(id: string, source: ImportSource, remoteId: string): void {
    this.done.add(`${id}|${source}|${remoteId}`);
  }

  isDone(id: string, source: ImportSource, remoteId: string): boolean {
    return this.done.has(`${id}|${source}|${remoteId}`);
  }

  stored(): string {
    return JSON.stringify([[...this.records.values()], [...this.done]]);
  }
}
