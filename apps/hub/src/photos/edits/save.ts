import { Readable } from 'node:stream';
import { posix } from 'node:path';
import { ApiError, type DriveItem, type PhotoRecipe } from '@smarteverything/domain';
import { commitContent } from '../../drive/changes';
import { locate } from '../../drive/intents';
import { checkLoadedDriveWrite } from '../../drive/quotas';
import { changeActorOf } from '../../drive/service-write-support';
import { stageBytes, stageVersion } from '../../drive/versions';
import type { EditDeps } from './deps';
import { stackWithOriginal } from './stack';
import { renderPhoto, OUTPUT_FORMATS, type OutputFormat } from './render';
import { openPhoto } from './source';
import { copyFormat, stemOf, type EditTarget, type ImageItem, type Original } from './target';
import type { PatchStore } from './patches';

export const COPY_SUFFIX = ' (edited)';

async function copyPath(
  deps: EditDeps,
  target: EditTarget<ImageItem>,
  format: OutputFormat,
): Promise<string> {
  const { stem } = stemOf(target.item.name);
  const folder = posix.dirname(target.item.relPath);
  const extension = OUTPUT_FORMATS[format].extension;
  for (let attempt = 1; ; attempt += 1) {
    const tag = attempt === 1 ? COPY_SUFFIX : ` (edited ${String(attempt)})`;
    const name = `${stem}${tag}.${extension}`;
    const relPath = folder === '.' ? name : `${folder}/${name}`;
    if (
      (await deps.store.host.call('driveItems', 'byPath', target.root.id, relPath, null)) ===
      undefined
    )
      return relPath;
  }
}

export interface SaveRequest {
  readonly target: EditTarget<ImageItem>;
  readonly original: Original;
  readonly recipe: PhotoRecipe;
  readonly mode: 'version' | 'copy';
  readonly patches: PatchStore;
  readonly signal: AbortSignal;
}

export interface Saved {
  readonly item: DriveItem;
  readonly versionId: string | null;
  readonly sha256: string;
}

export async function saveRendered(deps: EditDeps, request: SaveRequest): Promise<Saved> {
  const { target, recipe, mode } = request;
  const format = copyFormat(target.item);
  const photo = await openPhoto(
    { path: request.original.path, mime: target.item.mime, name: target.item.name },
    deps.decoders,
    request.signal,
  );
  const rendered = await renderPhoto({
    photo,
    recipe,
    format,
    colour: deps.colour,
    patch: (patchId) => request.patches.read(target.item.id, patchId),
  });
  await checkLoadedDriveWrite(deps.store, deps.space, {
    profileId: target.caller.profileId,
    addBytes: rendered.bytes.byteLength,
    releasedBytes: 0,
    path: target.root.path,
  });
  const staged = await stageBytes(deps.env, target.root, Readable.from([rendered.bytes]));
  const relPath = mode === 'version' ? target.item.relPath : await copyPath(deps, target, format);
  const written = await commitContent(deps.env, {
    root: target.root,
    staged,
    relPath,
    actor: changeActorOf(target.caller),
  }).catch(async (cause: unknown) => {
    await deps.env.files.remove(await locate(target.root, staged.relPath));
    throw cause;
  });
  if (mode === 'copy') await stackWithOriginal(deps, target.item, written.item);
  return { item: written.item, versionId: written.version?.id ?? null, sha256: staged.sha256 };
}

export async function restoreOriginal(
  deps: EditDeps,
  target: EditTarget<ImageItem>,
  versionId: string,
): Promise<DriveItem> {
  const entry = await deps.store.host.call('driveVersions', 'find', versionId);
  if (entry?.version.itemId !== target.item.id || entry.rootId !== target.root.id) {
    throw new ApiError('conflict', 'The original of this photo is no longer kept.');
  }
  await checkLoadedDriveWrite(deps.store, deps.space, {
    profileId: target.caller.profileId,
    addBytes: entry.version.bytes,
    releasedBytes: 0,
    path: target.root.path,
  });
  const staged = await stageVersion(deps.env, target.root, entry.version);
  try {
    const written = await commitContent(deps.env, {
      root: target.root,
      staged,
      relPath: target.item.relPath,
      actor: changeActorOf(target.caller),
    });
    return written.item;
  } catch (cause) {
    await deps.env.files.remove(await locate(target.root, staged.relPath));
    throw cause;
  }
}
