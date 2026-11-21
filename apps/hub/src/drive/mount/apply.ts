import { truncate } from 'node:fs/promises';
import type { DriveItem } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ContentAlongside } from '../units/content';
import { commitContent, type ChangeActor } from '../changes';
import { locate, type DriveWriteRoot } from '../intents';
import { commitPatchContent } from '../patch-content';
import type { ByteRange, ContentPatch } from '../patch-files';
import type { PosixChangeEnv } from '../posix/env';
import { stageInPlace } from '../versions';
import { coversRanges } from '../../store/repositories/drive-mount-commits';

export function changedElsewhere(
  env: { readonly store: Pick<Store, 'host'> },
  item: Pick<DriveItem, 'id' | 'rev'>,
  nodeId: string,
  baseRev: number,
): Promise<boolean> {
  if (item.rev === baseRev) return Promise.resolve(false);
  return env.store.host.read('driveChangedElsewhere', {
    itemId: item.id,
    rev: item.rev,
    nodeId,
    baseRev,
  });
}

export interface ApplyRequest {
  readonly root: DriveWriteRoot;
  readonly relPath: string;
  readonly staged: string;
  readonly ranges: readonly ByteRange[];
  readonly size: number;
  readonly digest: () => Promise<string>;
  readonly actor: ChangeActor;
  readonly alongside: readonly ContentAlongside[];
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
    const bytes = await stageInPlace(env, root, staged, await request.digest());
    const written = await commitContent(env, {
      root,
      staged: bytes,
      relPath,
      actor,
      alongside: request.alongside,
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
    alongside: request.alongside,
  });
  return written.item;
}
