import { truncate } from 'node:fs/promises';
import type { DriveItem } from '@smarteverything/domain';
import { commitContent, type ChangeActor } from '../changes';
import { locate, type DriveWriteRoot } from '../intents';
import { commitPatchContent } from '../patch-content';
import type { ByteRange, ContentPatch } from '../patch-files';
import type { PosixChangeEnv } from '../posix/env';
import { stageInPlace } from '../versions';
import { coversRanges } from '../../store/repositories/drive-mount-commits';

const PAGE = 100;

export function changedElsewhere(
  env: PosixChangeEnv,
  item: DriveItem,
  nodeId: string,
  baseRev: number,
): boolean {
  if (item.rev === baseRev) return false;
  let before: number | null = null;
  for (;;) {
    const window = env.store.driveFeed.recentOfItem(item.id, before, PAGE);
    for (const row of window.rows) {
      if (row.rev <= baseRev) return false;
      if (row.via !== 'mount' || row.deviceId !== nodeId) return true;
    }
    if (window.next === null) return false;
    before = window.next;
  }
}

export interface ApplyRequest {
  readonly root: DriveWriteRoot;
  readonly relPath: string;
  readonly staged: string;
  readonly ranges: readonly ByteRange[];
  readonly size: number;
  readonly actor: ChangeActor;
  readonly settled: (item: DriveItem) => void;
}

export function clampRanges(ranges: readonly ByteRange[], size: number): readonly ByteRange[] {
  const kept: ByteRange[] = [];
  for (const [start, end] of ranges) {
    const clipped = Math.min(end, size);
    if (clipped > start) kept.push([start, clipped]);
  }
  return kept;
}

export async function applyContent(env: PosixChangeEnv, request: ApplyRequest): Promise<DriveItem> {
  const { root, relPath, staged, actor } = request;
  if (coversRanges(request.ranges, request.size)) {
    await truncate(await locate(root, staged), request.size);
    const bytes = await stageInPlace(env, root, staged);
    const written = await commitContent(env, {
      root,
      staged: bytes,
      relPath,
      actor,
      alongside: request.settled,
    });
    return written.item;
  }
  const patch: ContentPatch = {
    ranges: clampRanges(request.ranges, request.size),
    size: request.size,
  };
  const written = await commitPatchContent(env, {
    root,
    staged: { relPath: staged },
    relPath,
    patch,
    actor,
    alongside: request.settled,
  });
  return written.item;
}
