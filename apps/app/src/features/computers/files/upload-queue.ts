import type { FileUploadChunk, FileUploadResult } from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';
import { rawErrorText } from '../../../format/errors';
import type { PickedFile } from '../../../platform/pick-files';
import { base64Of, chunkOf, joinPath, piecesOf, uniqueName } from './file-model';

export type UploadState =
  'waiting' | 'conflict' | 'uploading' | 'done' | 'failed' | 'skipped' | 'cancelled';

export interface UploadItem {
  readonly id: number;
  readonly file: PickedFile;
  readonly folder: string;
  readonly target: string;
  readonly replace: boolean;
  readonly state: UploadState;
  readonly progress: number;
  readonly error: string | null;
}

export type Choice = 'replace' | 'both' | 'skip';

export type SendChunk = (chunk: FileUploadChunk) => Promise<FileUploadResult>;

export class UploadQueue {
  readonly items = new ValueStore<readonly UploadItem[]>([]);
  private nextId = 1;
  private pump: Promise<void> = Promise.resolve();
  private readonly taken = new Map<string, Set<string>>();

  constructor(
    private readonly send: SendChunk,
    private readonly onSettled: () => void,
  ) {}

  add(files: readonly PickedFile[], folder: string, present: ReadonlySet<string>): void {
    const names = this.namesIn(folder, present);
    const added = files.map((file): UploadItem => {
      const id = this.nextId;
      this.nextId += 1;
      const conflict = names.has(file.name);
      names.add(file.name);
      return {
        id,
        file,
        folder,
        target: file.name,
        replace: false,
        state: conflict ? 'conflict' : 'waiting',
        progress: 0,
        error: null,
      };
    });
    this.items.update((current) => [...current, ...added]);
    this.drain();
  }

  decide(id: number, choice: Choice): void {
    if (choice === 'skip') {
      this.patch(id, { state: 'skipped' });
      return;
    }
    const item = this.items.get().find((candidate) => candidate.id === id);
    if (item === undefined) return;
    const names = this.namesIn(item.folder, new Set());
    const target = choice === 'both' ? uniqueName(item.file.name, names) : item.target;
    names.add(target);
    this.patch(id, { state: 'waiting', target, replace: choice === 'replace' });
    this.drain();
  }

  cancel(id: number): void {
    this.patch(id, { state: 'cancelled' });
  }

  cancelAll(): void {
    this.items.update((current) =>
      current.map((item) =>
        item.state === 'done' || item.state === 'skipped' ? item : { ...item, state: 'cancelled' },
      ),
    );
  }

  private namesIn(folder: string, present: ReadonlySet<string>): Set<string> {
    const known = this.taken.get(folder) ?? new Set<string>();
    present.forEach((name) => known.add(name));
    this.taken.set(folder, known);
    return known;
  }

  private patch(id: number, change: Partial<UploadItem>): void {
    this.items.update((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }

  private stateOf(id: number): UploadState | undefined {
    return this.items.get().find((item) => item.id === id)?.state;
  }

  private drain(): void {
    this.pump = this.pump.then(() => this.next());
  }

  private async next(): Promise<void> {
    for (
      let item = this.items.get().find((candidate) => candidate.state === 'waiting');
      item !== undefined;
      item = this.items.get().find((candidate) => candidate.state === 'waiting')
    ) {
      this.patch(item.id, { state: 'uploading', progress: 0 });
      await this.upload(item);
      this.onSettled();
    }
  }

  private async upload(item: UploadItem): Promise<void> {
    try {
      const data = await item.file.data();
      const path = joinPath(item.folder, item.target);
      for (const piece of piecesOf(data.byteLength)) {
        if (this.stateOf(item.id) !== 'uploading') return;
        const body = base64Of(data, piece.start, piece.end);
        await this.send(chunkOf(path, piece, body, item.replace));
        this.patch(item.id, { progress: data.byteLength === 0 ? 1 : piece.end / data.byteLength });
      }
      if (this.stateOf(item.id) === 'uploading')
        this.patch(item.id, { state: 'done', progress: 1 });
    } catch (error) {
      this.patch(item.id, { state: 'failed', error: rawErrorText(error) });
    }
  }
}
