import { background } from '@smarteverything/logging';
import { ValueStore } from '../../../design/external-store';
import { rawErrorText } from '../../../format/errors';
import type { PickedBlob } from '../../../platform/pick-files';
import {
  locationKeyOf,
  type FileLocation,
  type UploadHandle,
  type UploadOutcome,
  type UploadTransport,
} from '../source/types';

export type UploadState =
  | 'waiting'
  | 'conflict'
  | 'sending'
  | 'paused'
  | 'done'
  | 'have'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface UploadItem {
  readonly id: string;
  readonly file: PickedBlob;
  readonly folder: FileLocation;
  readonly folderKey: string;
  readonly name: string;
  readonly replace: boolean;
  readonly state: UploadState;
  readonly sent: number;
  readonly size: number;
  readonly storedAs: string | null;
  readonly error: string | null;
  readonly retryable: boolean;
}

export type Choice = 'replace' | 'both' | 'skip';

const SETTLED: ReadonlySet<UploadState> = new Set([
  'done',
  'have',
  'failed',
  'skipped',
  'cancelled',
]);

export function isSettled(state: UploadState): boolean {
  return SETTLED.has(state);
}

export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let number = 2; ; number += 1) {
    const candidate = `${stem} (${String(number)})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function settledChange(outcome: UploadOutcome, size: number): Partial<UploadItem> {
  switch (outcome.kind) {
    case 'done':
      return {
        state: 'done',
        sent: size,
        storedAs: outcome.renamed ? outcome.name : null,
        error: null,
      };
    case 'have':
      return { state: 'have', sent: size, error: null };
    case 'cancelled':
      return { state: 'cancelled' };
    case 'failed':
      return { state: 'failed', error: outcome.text, retryable: outcome.retryable };
  }
}

export class UploadQueue {
  readonly items = new ValueStore<readonly UploadItem[]>([]);
  private sequence = 0;
  private readonly handles = new Map<string, UploadHandle>();
  private readonly taken = new Map<string, Set<string>>();

  constructor(
    private transport: UploadTransport,
    private readonly onSettled: (item: UploadItem) => void,
  ) {}

  setTransport(transport: UploadTransport): void {
    this.transport = transport;
  }

  add(files: readonly PickedBlob[], folder: FileLocation, present: ReadonlySet<string>): void {
    const folderKey = locationKeyOf(folder);
    const names = this.namesIn(folderKey, present);
    const ask = this.transport.conflicts === 'ask';
    const added = files.map((file): UploadItem => {
      this.sequence += 1;
      const conflict = ask && names.has(file.name);
      names.add(file.name);
      return {
        id: String(this.sequence),
        file,
        folder,
        folderKey,
        name: file.name,
        replace: false,
        state: conflict ? 'conflict' : 'waiting',
        sent: 0,
        size: file.bytes,
        storedAs: null,
        error: null,
        retryable: false,
      };
    });
    this.items.update((current) => [...current, ...added]);
    this.pump();
  }

  decide(id: string, choice: Choice): void {
    const item = this.find(id);
    if (item?.state !== 'conflict') return;
    if (choice === 'skip') {
      this.patch(id, { state: 'skipped' });
      return;
    }
    const names = this.namesIn(item.folderKey, new Set());
    const name = choice === 'both' ? uniqueName(item.file.name, names) : item.name;
    names.add(name);
    this.patch(id, { state: 'waiting', name, replace: choice === 'replace' });
    this.pump();
  }

  pause(id: string): void {
    const handle = this.handles.get(id);
    if (handle === undefined || this.find(id)?.state !== 'sending') return;
    this.patch(id, { state: 'paused' });
    background(handle.pause(), 'files.upload_pause_failed');
  }

  resume(id: string): void {
    const handle = this.handles.get(id);
    if (handle === undefined || this.find(id)?.state !== 'paused') return;
    this.patch(id, { state: 'sending' });
    handle.resume();
  }

  retry(id: string): void {
    const item = this.find(id);
    if (item?.state !== 'failed') return;
    this.patch(id, { state: 'waiting', sent: 0, error: null, retryable: false });
    this.pump();
  }

  cancel(id: string): void {
    const item = this.find(id);
    if (item === undefined || isSettled(item.state)) return;
    this.patch(id, { state: 'cancelled' });
    const handle = this.handles.get(id);
    if (handle !== undefined) background(handle.cancel(), 'files.upload_cancel_failed');
  }

  cancelAll(): void {
    for (const item of this.items.get()) this.cancel(item.id);
  }

  clearSettled(folderKey: string): void {
    this.items.update((current) =>
      current.filter((item) => item.folderKey !== folderKey || !isSettled(item.state)),
    );
  }

  private find(id: string): UploadItem | undefined {
    return this.items.get().find((item) => item.id === id);
  }

  private namesIn(folderKey: string, present: ReadonlySet<string>): Set<string> {
    const known = this.taken.get(folderKey) ?? new Set<string>();
    present.forEach((name) => known.add(name));
    this.taken.set(folderKey, known);
    return known;
  }

  private patch(id: string, change: Partial<UploadItem>): void {
    this.items.update((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }

  private pump(): void {
    const items = this.items.get();
    const busy = items.some((item) => item.state === 'sending' || item.state === 'paused');
    if (this.transport.serial && busy) return;
    const waiting = items.filter((item) => item.state === 'waiting');
    for (const item of this.transport.serial ? waiting.slice(0, 1) : waiting) this.begin(item);
  }

  private begin(item: UploadItem): void {
    this.patch(item.id, { state: 'sending', sent: 0 });
    const job = {
      id: item.id,
      file: item.file,
      folder: item.folder,
      name: item.name,
      replace: item.replace,
    };
    const handle = this.transport.start(job, (sent) => {
      if (!isSettled(this.find(item.id)?.state ?? 'cancelled')) this.patch(item.id, { sent });
    });
    this.handles.set(item.id, handle);
    background(this.finish(item.id, handle), 'files.upload_failed');
  }

  private async finish(id: string, handle: UploadHandle): Promise<void> {
    const outcome = await handle.outcome.catch((error: unknown): UploadOutcome => ({
      kind: 'failed',
      text: rawErrorText(error),
      retryable: false,
    }));
    this.handles.delete(id);
    const before = this.find(id);
    if (before !== undefined && before.state !== 'cancelled') {
      this.patch(id, settledChange(outcome, before.size));
    }
    const item = this.find(id);
    if (item !== undefined) this.onSettled(item);
    this.pump();
  }
}
