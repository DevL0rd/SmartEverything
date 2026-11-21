import type {
  DriveConflict,
  DriveConflictResolution,
  DriveFeedOp,
  DriveItem,
  DriveTrashEntry,
} from '@smarteverything/domain';
import type {
  DriveDiskStat,
  DriveInode,
  DriveInodeAttributes,
  DriveInodeDraft,
  DriveInodeTimes,
} from '../../store/repositories/drive-inodes';
import type { XattrFlag, XattrSetResult } from '../../store/repositories/drive-xattrs';
import type { DriveIntent, DriveIntentInput } from '../../store/repositories/drive-intents';
import type { DriveVersionPurge } from '../../store/repositories/drive-versions';
import type { DriveInodePatch } from '../../store/repositories/drive-item-inodes';
import type { DriveItemDraft, DriveItemIdentity } from '../../store/repositories/drive-items';
import type { Store } from '../../store/store';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import type { ChangeActor } from '../changes';
import { currentClaim, type ReplayClaim } from '../replay-claims';
import type { RepathChange, RepathTarget } from '../service-write-repath';
import type { SettledContent, SettleInput } from './content';
import { runOp } from './ops-run';

export interface TrashRecord {
  readonly rootId: string;
  readonly item: DriveItem;
  readonly entry: DriveTrashEntry;
  readonly intentId: string | null;
  readonly actor: ChangeActor;
}

export interface Reinstate {
  readonly rootId: string;
  readonly itemId: string;
  readonly relPath: string;
  readonly parentId: string | null;
  readonly draft: DriveItemDraft;
  readonly identity: DriveItemIdentity;
  readonly shareInode: number | null;
  readonly intentId: string | null;
  readonly actor: ChangeActor;
}

export interface XattrChange {
  readonly inodeId: number;
  readonly name: string;
  readonly times: DriveInodeTimes;
  readonly actor: ChangeActor;
}

export type DriveOp =
  | { readonly kind: 'content'; readonly input: SettleInput }
  | {
      readonly kind: 'create';
      readonly draft: DriveItemDraft;
      readonly identity: DriveItemIdentity;
      readonly inode: DriveInodePatch;
      readonly actor: ChangeActor;
    }
  | {
      readonly kind: 'inode';
      readonly item: DriveItem;
      readonly identity: DriveItemIdentity;
      readonly patch: DriveInodePatch;
      readonly actor: ChangeActor;
    }
  | { readonly kind: 'trash'; readonly trash: TrashRecord }
  | { readonly kind: 'forget'; readonly item: DriveItem; readonly actor: ChangeActor }
  | {
      readonly kind: 'orphan';
      readonly item: DriveItem;
      readonly inodeId: number;
      readonly actor: ChangeActor;
    }
  | { readonly kind: 'times'; readonly inodeId: number; readonly times: DriveInodeTimes }
  | {
      readonly kind: 'diskTimes';
      readonly inodeId: number;
      readonly times: DriveInodeTimes;
      readonly disk: DriveDiskStat;
    }
  | {
      readonly kind: 'attributes';
      readonly inodeId: number;
      readonly attributes: DriveInodeAttributes;
    }
  | { readonly kind: 'orphanFlag'; readonly inodeId: number; readonly orphan: boolean }
  | { readonly kind: 'orphanInode'; readonly draft: DriveInodeDraft }
  | { readonly kind: 'removeInode'; readonly inodeId: number }
  | {
      readonly kind: 'announce';
      readonly item: DriveItem;
      readonly op: DriveFeedOp;
      readonly actor: ChangeActor;
    }
  | {
      readonly kind: 'write';
      readonly draft: DriveItemDraft;
      readonly identity: DriveItemIdentity;
      readonly shareInode: number | null;
      readonly blocksOf: { readonly itemId: string; readonly rev: number } | null;
    }
  | {
      readonly kind: 'repath';
      readonly itemId: string;
      readonly target: RepathTarget;
      readonly change: RepathChange;
    }
  | {
      readonly kind: 'xattrSet';
      readonly xattr: XattrChange;
      readonly value: Uint8Array;
      readonly flag: XattrFlag;
    }
  | { readonly kind: 'xattrRemove'; readonly xattr: XattrChange }
  | { readonly kind: 'claim'; readonly claim: ReplayClaim }
  | {
      readonly kind: 'mountRanges';
      readonly ranges: readonly {
        readonly id: number;
        readonly ranges: readonly (readonly [number, number])[];
      }[];
    }
  | {
      readonly kind: 'mountFinish';
      readonly commitId: number;
      readonly size: number;
      readonly rev: number;
    }
  | { readonly kind: 'entry'; readonly rootId: string; readonly relPath: string }
  | { readonly kind: 'reinstate'; readonly reinstate: Reinstate }
  | { readonly kind: 'intent'; readonly intent: DriveIntentInput }
  | { readonly kind: 'clearIntent'; readonly intentId: string }
  | { readonly kind: 'purgeTrash'; readonly itemId: string }
  | { readonly kind: 'purgeVersions'; readonly ids: readonly string[] }
  | {
      readonly kind: 'resolve';
      readonly conflictId: string;
      readonly resolution: DriveConflictResolution;
      readonly at: string;
    };

export type DriveOpResult =
  | { readonly kind: 'content'; readonly settled: SettledContent }
  | { readonly kind: 'item'; readonly item: DriveItem }
  | { readonly kind: 'entry'; readonly inode: DriveInode; readonly nlink: number }
  | { readonly kind: 'conflict'; readonly conflict: DriveConflict }
  | { readonly kind: 'intent'; readonly intent: DriveIntent }
  | { readonly kind: 'purged'; readonly purged: DriveVersionPurge }
  | { readonly kind: 'inode'; readonly inode: DriveInode }
  | { readonly kind: 'xattr'; readonly set: XattrSetResult }
  | { readonly kind: 'missing' }
  | { readonly kind: 'done' };

export function runDriveOps(store: HostStore, ops: readonly DriveOp[]): DriveOpResult[] {
  return ops.map((op) => runOp(store, op));
}

export class DriveOpResultError extends Error {
  override readonly name = 'DriveOpResultError';

  constructor(
    readonly expected: DriveOpResult['kind'],
    readonly found: DriveOpResult['kind'] | 'nothing',
  ) {
    super(`A drive write returned ${found} where ${expected} was expected.`);
  }
}

function isKind<K extends DriveOpResult['kind']>(
  result: DriveOpResult | undefined,
  kind: K,
): result is Extract<DriveOpResult, { readonly kind: K }> {
  return result?.kind === kind;
}

export function resultOf<K extends DriveOpResult['kind']>(
  results: readonly DriveOpResult[],
  index: number,
  kind: K,
): Extract<DriveOpResult, { readonly kind: K }> {
  const result = results[index];
  if (!isKind(result, kind)) throw new DriveOpResultError(kind, result?.kind ?? 'nothing');
  return result;
}

export const DRIVE_OPS_UNIT = storeUnit((store, ops: readonly DriveOp[]) =>
  runDriveOps(store, ops),
);

export function writeDriveOps(
  store: Pick<Store, 'host'>,
  ops: readonly DriveOp[],
): Promise<DriveOpResult[]> {
  const claim = currentClaim();
  return store.host.write(
    'driveOps',
    claim === undefined ? ops : [...ops, { kind: 'claim', claim }],
  );
}
