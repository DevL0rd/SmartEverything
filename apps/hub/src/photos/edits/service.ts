import {
  ApiError,
  type PhotoEdit,
  type PhotoEditBase,
  type PhotoEditPatch,
  type PhotoEditSave,
  type PhotoEditSaved,
  type PhotoErase,
  type PhotoErased,
} from '@smarteverything/domain';
import type { DriveCaller } from '../../drive/service-write-support';
import type { PhotoEditRow } from '../../store/repositories/photo-edits';
import type { EditDeps } from './deps';
import { eraseStrokes } from './eraser';
import { Lane } from './lane';
import { PatchStore } from './patches';
import { rasterOf } from './raster';
import { restoreOriginal, saveRendered } from './save';
import { openPhoto } from './source';
import { previewDataUrl } from './base';
import {
  canEditItem,
  capabilityOf,
  editOf,
  imageTarget,
  originalOf,
  readableImage,
  type EditTarget,
  type ImageItem,
} from './target';

export class PhotoEditService {
  private readonly lane = new Lane();
  private readonly patches: PatchStore;

  constructor(private readonly deps: EditDeps) {
    this.patches = new PatchStore(deps.layout);
  }

  async read(caller: DriveCaller, itemId: string): Promise<PhotoEdit> {
    const item = readableImage(this.deps, caller, itemId);
    if (!canEditItem(this.deps, caller, item)) {
      return {
        itemId,
        recipe: null,
        baseVersionId: null,
        edited: false,
        canEdit: false,
        canSaveVersion: false,
        copyOnlyReason: 'You can only view this photo; you cannot change it.',
      };
    }
    const target = imageTarget(this.deps, caller, itemId);
    const { row } = editOf(this.deps, target);
    const original = await originalOf(this.deps, target, row);
    const capability = capabilityOf(this.deps, target);
    const kept = row !== undefined && original.baseVersionId !== null;
    return {
      itemId,
      recipe: kept ? row.recipe : null,
      baseVersionId: original.baseVersionId,
      edited: kept,
      canEdit: true,
      ...capability,
    };
  }

  async readPatch(caller: DriveCaller, itemId: string, patchId: string): Promise<PhotoEditPatch> {
    imageTarget(this.deps, caller, itemId);
    const png = await this.patches.read(itemId, patchId);
    return { patchId, png: `data:image/png;base64,${png.toString('base64')}` };
  }

  async readBase(caller: DriveCaller, itemId: string): Promise<PhotoEditBase> {
    const target = imageTarget(this.deps, caller, itemId);
    const original = await originalOf(this.deps, target, editOf(this.deps, target).row);
    return {
      itemId,
      baseVersionId: original.baseVersionId,
      image: await previewDataUrl(
        await this.open(target, original.path, new AbortController().signal),
      ),
    };
  }

  private open(
    target: EditTarget<ImageItem>,
    path: string,
    signal: AbortSignal,
  ): ReturnType<typeof openPhoto> {
    return openPhoto(
      { path, mime: target.item.mime, name: target.item.name },
      this.deps.decoders,
      signal,
    );
  }

  private liveEdit(target: EditTarget<ImageItem>): {
    readonly stale: boolean;
    readonly row: PhotoEditRow | undefined;
  } {
    const live = editOf(this.deps, target);
    if (live.stale) this.deps.store.photoEdits.remove(target.item.id, target.caller.profileId);
    return live;
  }

  save(caller: DriveCaller, itemId: string, body: PhotoEditSave): Promise<PhotoEditSaved> {
    return this.lane.run(async () => {
      const target = imageTarget(this.deps, caller, itemId);
      const capability = capabilityOf(this.deps, target);
      if (body.mode === 'version' && !capability.canSaveVersion) {
        throw new ApiError(
          'invalid_request',
          capability.copyOnlyReason ?? 'Save as a copy instead.',
        );
      }
      const { row } = this.liveEdit(target);
      const original = await originalOf(this.deps, target, row);
      const saved = await saveRendered(this.deps, {
        target,
        original,
        recipe: body.recipe,
        mode: body.mode,
        patches: this.patches,
        signal: new AbortController().signal,
      });
      if (body.mode === 'version') {
        this.deps.store.photoEdits.save(itemId, caller.profileId, {
          recipe: body.recipe,
          baseVersionId: original.baseVersionId ?? saved.versionId,
          resultSha256: saved.sha256,
        });
      }
      await this.patches.keepOnly(itemId, this.referenced(caller, itemId, body));
      return { itemId: saved.item.id, rev: saved.item.rev };
    });
  }

  revert(caller: DriveCaller, itemId: string): Promise<PhotoEditSaved> {
    return this.lane.run(async () => {
      const target = imageTarget(this.deps, caller, itemId);
      const { row, stale } = this.liveEdit(target);
      if (stale) {
        throw new ApiError(
          'conflict',
          'This photo changed after it was edited, so there is no earlier original to restore.',
        );
      }
      const original = await originalOf(this.deps, target, row);
      if (original.baseVersionId === null) {
        throw new ApiError('invalid_request', 'This photo has no edit to revert.');
      }
      const restored = await restoreOriginal(this.deps, target, original.baseVersionId);
      this.deps.store.photoEdits.remove(itemId, caller.profileId);
      await this.patches.keepOnly(itemId, new Set());
      return { itemId: restored.id, rev: restored.rev };
    });
  }

  private referenced(caller: DriveCaller, itemId: string, body: PhotoEditSave): Set<string> {
    const stored = this.deps.store.photoEdits.find(itemId, caller.profileId)?.recipe.patches ?? [];
    return new Set([...stored, ...body.recipe.patches].map((patch) => patch.patchId));
  }

  async erase(caller: DriveCaller, itemId: string, body: PhotoErase): Promise<PhotoErased> {
    const target = imageTarget(this.deps, caller, itemId);
    const original = await originalOf(this.deps, target, editOf(this.deps, target).row);
    const signal = new AbortController().signal;
    const photo = await this.open(target, original.path, signal);
    const patch = await eraseStrokes(await rasterOf(photo.image), {
      eraser: this.deps.eraser,
      profileId: caller.profileId,
      itemId,
      strokes: body.strokes,
      signal,
    });
    await this.patches.write(itemId, patch.patchId, patch.png);
    return {
      patchId: patch.patchId,
      box: patch.box,
      png: `data:image/png;base64,${patch.png.toString('base64')}`,
    };
  }
}
