import type { DriveItemDraft } from '../store/repositories/drive-items';
import type {
  MissingItem,
  MissingRecord,
  ReclaimPlace,
} from '../store/repositories/drive-missing';
import { purgeDeadline } from './intents';
import { isoOf, under, type Indexed } from './scanner-index';
import type { WalkEntry } from './scanner-walk';

export type Reuse =
  | { readonly kind: 'live'; readonly indexed: Indexed }
  | { readonly kind: 'missing'; readonly item: MissingItem };

export interface Unknown {
  readonly entry: WalkEntry;
  readonly sha256: string | null;
}

interface Candidate {
  readonly relPath: string;
  readonly bytes: number;
  readonly sha256: string | null;
  readonly reuse: Reuse;
}

export function withHash(draft: DriveItemDraft, sha256: string | null): DriveItemDraft {
  if (sha256 === null || draft.kind === 'folder' || draft.kind === 'link') return draft;
  if (draft.kind === 'special' || draft.sha256 !== null) return draft;
  return { ...draft, sha256, integrity: 'ok' };
}

export function filesBySize(indexed: readonly Indexed[]): Map<number, Indexed[]> {
  const sized = new Map<number, Indexed[]>();
  for (const file of indexed.filter((one) => one.kind === 'file')) {
    const same = sized.get(file.bytes);
    if (same === undefined) sized.set(file.bytes, [file]);
    else same.push(file);
  }
  return sized;
}

export function reclaimPlace(
  found: Unknown,
  item: MissingItem,
  parentId: string | null,
): ReclaimPlace {
  const { entry, sha256 } = found;
  return {
    parentId,
    relPath: entry.relPath,
    name: entry.name,
    modifiedAt: sha256 !== null && item.sha256 === sha256 ? isoOf(entry) : null,
    mtimeNs: entry.mtimeNs,
    dev: entry.dev,
    ino: entry.ino,
  };
}

export function missingRecords(
  rootId: string,
  swept: Indexed,
  live: Iterable<Indexed>,
  at: string,
): MissingRecord[] {
  const files =
    swept.kind === 'folder'
      ? [...live].filter((inside) => inside.kind === 'file' && under(inside.relPath, swept.relPath))
      : [swept];
  return files
    .filter((file) => file.kind === 'file')
    .map((file) => ({
      itemId: file.id,
      rootId,
      relPath: file.relPath,
      bytes: file.bytes,
      sha256: file.sha256,
      missingAt: at,
      purgeAt: purgeDeadline(at),
    }));
}

export class ReuseIndex {
  private readonly hashedSizes = new Set<number>();
  private missing: MissingItem[];

  constructor(missing: readonly MissingItem[]) {
    this.missing = [...missing];
    for (const item of missing) this.noteLive(item);
  }

  noteLive(item: Pick<Indexed, 'bytes' | 'sha256'>): void {
    if (item.sha256 !== null) this.hashedSizes.add(item.bytes);
  }

  mayReuse(entry: WalkEntry): boolean {
    return (
      entry.kind === 'file' &&
      (this.hashedSizes.has(entry.bytes) ||
        this.missing.some((item) => item.relPath === entry.relPath))
    );
  }

  wantsHash(entry: WalkEntry, open: readonly Indexed[]): boolean {
    return this.candidates(entry, open).some((candidate) => candidate.sha256 !== null);
  }

  chosen(found: Unknown, open: readonly Indexed[]): Reuse | null {
    const { entry, sha256 } = found;
    if (sha256 !== null) {
      const same = this.candidates(entry, open).filter((candidate) => candidate.sha256 === sha256);
      const here = same.filter((candidate) => candidate.relPath === entry.relPath);
      const [only] = same;
      const [winner] = here;
      if (same.length === 1 && only !== undefined) return only.reuse;
      if (same.length > 1) return here.length === 1 && winner !== undefined ? winner.reuse : null;
    }
    const edited = this.missing.find((item) => item.relPath === entry.relPath);
    return edited === undefined ? null : { kind: 'missing', item: edited };
  }

  take(item: MissingItem): void {
    this.missing = this.missing.filter((other) => other.itemId !== item.itemId);
  }

  private candidates(entry: WalkEntry, open: readonly Indexed[]): Candidate[] {
    const live = open.map((indexed): Candidate => ({ ...indexed, reuse: { kind: 'live', indexed } }));
    const missing = this.missing
      .filter((item) => item.bytes === entry.bytes)
      .map((item): Candidate => ({ ...item, reuse: { kind: 'missing', item } }));
    return [...live, ...missing].filter((candidate) => candidate.bytes === entry.bytes);
  }
}
