import { readdir } from 'node:fs/promises';
import { IDENTITY_RECIPE, type PhotoRecipe } from '@smarteverything/domain';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PhotoEditService } from '../../../src/photos/edits/service';
import { DriveMediaRepository } from '../../../src/store/repositories/drive-media';
import { bundleColourWorker, type ColourWorkerBundle } from './edit-fixture';
import { grey, meanOf, openRig, sha, type Rig } from './service-fixture';

const BRIGHT: PhotoRecipe = {
  ...IDENTITY_RECIPE,
  light: { ...IDENTITY_RECIPE.light, exposure: 60 },
};

let bundle: ColourWorkerBundle;
let rig: Rig;
let service: PhotoEditService;
let erased = 0;

beforeAll(async () => {
  bundle = await bundleColourWorker();
});

afterAll(() => {
  bundle.dispose();
});

beforeEach(async () => {
  erased = 0;
  rig = await openRig(bundle.script, {
    erase: async () => {
      erased += 1;
      return sharp({
        create: { width: 16, height: 16, channels: 3, background: { r: 250, g: 10, b: 10 } },
      })
        .png()
        .toBuffer();
    },
  });
  service = new PhotoEditService(rig.deps);
});

afterEach(async () => {
  await rig.opened.close();
});

describe('reading an edit', () => {
  it('reports an untouched jpeg as saveable over the original', async () => {
    const item = await rig.seed('Photos/a.jpg', await grey(64, 48, 100));
    expect(await service.read(rig.owner, item.id)).toStrictEqual({
      itemId: item.id,
      recipe: null,
      baseVersionId: null,
      edited: false,
      canEdit: true,
      canSaveVersion: true,
      copyOnlyReason: null,
    });
  });

  it('says why a format or a drive without versions is copy only', async () => {
    const tiff = await rig.seed(
      'Photos/t.tif',
      await sharp(await grey(8, 8, 90))
        .tiff()
        .toBuffer(),
    );
    const read = await service.read(rig.owner, tiff.id);
    expect(read.canSaveVersion).toBe(false);
    expect(read.copyOnlyReason).toContain('JPEG copy');
    rig.opened.store.driveRoots.update(rig.mine.id, { versions: false });
    const plain = await rig.seed('Photos/b.jpg', await grey(8, 8, 90));
    expect((await service.read(rig.owner, plain.id)).copyOnlyReason).toContain(
      'no earlier versions',
    );
  });

  it('refuses a folder, a document and a photo the person cannot see', async () => {
    const folder = rig.opened.store.driveItems.byPath(rig.mine.id, 'Photos', null);
    await expect(service.read(rig.owner, folder?.id ?? '')).rejects.toMatchObject({
      code: 'invalid_request',
    });
    const item = await rig.seed('Photos/a.jpg', await grey(8, 8, 90));
    await expect(service.read(rig.member, item.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('answers a photo shared for viewing only as not editable instead of failing', async () => {
    const item = await rig.seed('Photos/a.jpg', await grey(8, 8, 90));
    rig.opened.store.driveGrants.set(
      { itemId: item.id, profileId: rig.memberId, role: 'view', expiresAt: null },
      rig.ownerId,
    );
    const read = await service.read(rig.member, item.id);
    expect(read).toMatchObject({ canEdit: false, canSaveVersion: false, edited: false });
    expect(read.copyOnlyReason).toContain('cannot change');
  });
});

describe('saving a version and reverting', () => {
  it('renders the recipe over the file, keeps the original as a version and reverts to it exactly', async () => {
    const original = await grey(64, 48, 100);
    const item = await rig.seed('Photos/a.jpg', original);
    const saved = await service.save(rig.owner, item.id, { recipe: BRIGHT, mode: 'version' });
    expect(saved.itemId).toBe(item.id);
    expect(saved.rev).toBeGreaterThan(item.rev);
    const edited = await rig.bytesOf('Photos/a.jpg');
    expect(await meanOf(edited)).toBeGreaterThan(150);
    const read = await service.read(rig.owner, item.id);
    expect(read).toMatchObject({ edited: true, recipe: BRIGHT });
    expect(read.baseVersionId).not.toBeNull();
    const version = rig.opened.store.driveVersions.byId(read.baseVersionId ?? '');
    expect(version.version.sha256).toBe(sha(original));
    const reverted = await service.revert(rig.owner, item.id);
    expect(reverted.rev).toBeGreaterThan(saved.rev);
    expect(sha(await rig.bytesOf('Photos/a.jpg'))).toBe(sha(original));
    expect(await service.read(rig.owner, item.id)).toMatchObject({ edited: false, recipe: null });
    await expect(service.revert(rig.owner, item.id)).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('renders every later save from the original, not from the earlier edit', async () => {
    const item = await rig.seed('Photos/a.jpg', await grey(64, 48, 100));
    await service.save(rig.owner, item.id, { recipe: BRIGHT, mode: 'version' });
    const first = (await service.read(rig.owner, item.id)).baseVersionId;
    await service.save(rig.owner, item.id, {
      recipe: { ...IDENTITY_RECIPE, flipHorizontal: true },
      mode: 'version',
    });
    expect(Math.abs((await meanOf(await rig.bytesOf('Photos/a.jpg'))) - 100)).toBeLessThan(2);
    expect((await service.read(rig.owner, item.id)).baseVersionId).toBe(first);
  });

  it('opens the original behind an edited photo for a second edit', async () => {
    const original = await grey(64, 48, 100);
    const item = await rig.seed('Photos/a.jpg', original);
    expect((await service.readBase(rig.owner, item.id)).baseVersionId).toBeNull();
    await service.save(rig.owner, item.id, { recipe: BRIGHT, mode: 'version' });
    const base = await service.readBase(rig.owner, item.id);
    expect(base.baseVersionId).toBe((await service.read(rig.owner, item.id)).baseVersionId);
    expect(base.image.startsWith('data:image/webp;base64,')).toBe(true);
    const bytes = Buffer.from(base.image.slice(base.image.indexOf(',') + 1), 'base64');
    expect(Math.abs((await meanOf(bytes)) - 100)).toBeLessThan(2);
    await expect(service.readBase(rig.member, item.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('forgets an edit once the file was replaced and neither saves over nor reverts to the old original', async () => {
    const item = await rig.seed('Photos/a.jpg', await grey(64, 48, 100));
    await service.save(rig.owner, item.id, { recipe: BRIGHT, mode: 'version' });
    const replacement = await grey(64, 48, 40);
    const replaced = await rig.seed('Photos/a.jpg', replacement);
    expect(await service.read(rig.owner, item.id)).toMatchObject({
      edited: false,
      recipe: null,
      baseVersionId: null,
    });
    const base = await service.readBase(rig.owner, item.id);
    expect(base.baseVersionId).toBeNull();
    expect(
      Math.abs(
        (await meanOf(Buffer.from(base.image.slice(base.image.indexOf(',') + 1), 'base64'))) - 40,
      ),
    ).toBeLessThan(2);
    await expect(service.revert(rig.owner, item.id)).rejects.toMatchObject({ code: 'conflict' });
    expect(sha(await rig.bytesOf('Photos/a.jpg'))).toBe(sha(replacement));
    const saved = await service.save(rig.owner, item.id, {
      recipe: { ...IDENTITY_RECIPE, flipHorizontal: true },
      mode: 'version',
    });
    expect(saved.rev).toBeGreaterThan(replaced.rev);
    expect(Math.abs((await meanOf(await rig.bytesOf('Photos/a.jpg'))) - 40)).toBeLessThan(2);
  });

  it('refuses a version save for a copy only photo', async () => {
    const tiff = await rig.seed(
      'Photos/t.tif',
      await sharp(await grey(8, 8, 90))
        .tiff()
        .toBuffer(),
    );
    await expect(
      service.save(rig.owner, tiff.id, { recipe: BRIGHT, mode: 'version' }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('keeps the png format and refuses to write when the disk is full', async () => {
    const item = await rig.seed('Photos/p.png', await grey(32, 32, 100, 'png'));
    await service.save(rig.owner, item.id, { recipe: BRIGHT, mode: 'version' });
    expect((await sharp(await rig.bytesOf('Photos/p.png')).metadata()).format).toBe('png');
    const before = sha(await rig.bytesOf('Photos/p.png'));
    rig.guard.freeBytes = 0;
    await expect(
      service.save(rig.owner, item.id, { recipe: IDENTITY_RECIPE, mode: 'version' }),
    ).rejects.toThrow();
    expect(sha(await rig.bytesOf('Photos/p.png'))).toBe(before);
  });
});

describe('saving a copy', () => {
  it('writes a new stacked photo beside the original and leaves the original alone', async () => {
    const original = await grey(64, 48, 100);
    const item = await rig.seed('Photos/a.jpg', original);
    const copy = await service.save(rig.owner, item.id, { recipe: BRIGHT, mode: 'copy' });
    expect(copy.itemId).not.toBe(item.id);
    expect(sha(await rig.bytesOf('Photos/a.jpg'))).toBe(sha(original));
    expect(await meanOf(await rig.bytesOf('Photos/a (edited).jpg'))).toBeGreaterThan(150);
    const media = new DriveMediaRepository(rig.opened.store.context);
    const stack = media.byId(item.id).stack_id;
    expect(stack).not.toBeNull();
    expect(media.byId(copy.itemId).stack_id).toBe(stack);
    expect(await service.read(rig.owner, item.id)).toMatchObject({ edited: false, recipe: null });
    const second = await service.save(rig.owner, item.id, { recipe: BRIGHT, mode: 'copy' });
    expect(rig.opened.store.driveItems.find(second.itemId, null)?.name).toBe('a (edited 2).jpg');
    expect(media.byId(second.itemId).stack_id).toBe(stack);
  });

  it('writes a jpeg copy of a format that cannot be saved in place', async () => {
    const tiff = await rig.seed(
      'Photos/t.tif',
      await sharp(await grey(16, 16, 90))
        .tiff()
        .toBuffer(),
    );
    await service.save(rig.owner, tiff.id, { recipe: BRIGHT, mode: 'copy' });
    expect((await sharp(await rig.bytesOf('Photos/t (edited).jpg')).metadata()).format).toBe(
      'jpeg',
    );
  });
});

describe('erasing', () => {
  const STROKES = [{ size: 0.2, points: [{ x: 0.5, y: 0.5 }] }];

  it('keeps a preview patch that the saved edit places over the photo', async () => {
    const item = await rig.seed('Photos/a.jpg', await grey(100, 100, 100));
    const patch = await service.erase(rig.owner, item.id, { strokes: STROKES });
    expect(erased).toBe(1);
    const { png, ...placed } = patch;
    expect(png.startsWith('data:image/png;base64,')).toBe(true);
    expect(
      (await sharp(Buffer.from(png.slice(png.indexOf(',') + 1), 'base64')).metadata()).format,
    ).toBe('png');
    const recipe: PhotoRecipe = { ...IDENTITY_RECIPE, patches: [placed] };
    await service.save(rig.owner, item.id, { recipe, mode: 'version' });
    const out = await sharp(await rig.bytesOf('Photos/a.jpg'))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (50 * out.info.width + 50) * out.info.channels;
    expect(out.data[at]).toBeGreaterThan(200);
    expect(out.data[at + 1]).toBeLessThan(60);
    const corner = 0;
    expect(Math.abs((out.data[corner] ?? 0) - 100)).toBeLessThan(3);
    expect((await service.read(rig.owner, item.id)).recipe?.patches).toStrictEqual([placed]);
  });

  it('answers the image of a kept patch again and refuses another person', async () => {
    const item = await rig.seed('Photos/a.jpg', await grey(100, 100, 100));
    const erasedPatch = await service.erase(rig.owner, item.id, { strokes: STROKES });
    const read = await service.readPatch(rig.owner, item.id, erasedPatch.patchId);
    expect(read).toStrictEqual({ patchId: erasedPatch.patchId, png: erasedPatch.png });
    await expect(service.readPatch(rig.member, item.id, erasedPatch.patchId)).rejects.toMatchObject(
      { code: 'not_found' },
    );
  });

  it('removes patches the saved edit no longer uses and refuses a missing patch', async () => {
    const item = await rig.seed('Photos/a.jpg', await grey(100, 100, 100));
    const { png: keptPng, ...kept } = await service.erase(rig.owner, item.id, { strokes: STROKES });
    const { png: droppedPng, ...dropped } = await service.erase(rig.owner, item.id, {
      strokes: STROKES,
    });
    expect(keptPng).not.toBe('');
    expect(droppedPng).not.toBe('');
    await service.save(rig.owner, item.id, {
      recipe: { ...IDENTITY_RECIPE, patches: [kept] },
      mode: 'version',
    });
    const names = await readdir(rig.opened.layout.cache.derived(item.id));
    expect(names).toContain(`patch-${kept.patchId}.png`);
    expect(names).not.toContain(`patch-${dropped.patchId}.png`);
    await expect(
      service.save(rig.owner, item.id, {
        recipe: { ...IDENTITY_RECIPE, patches: [dropped] },
        mode: 'version',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await service.revert(rig.owner, item.id);
    expect(await readdir(rig.opened.layout.cache.derived(item.id))).not.toContain(
      `patch-${kept.patchId}.png`,
    );
  });

  it('is only for photos the person can change', async () => {
    const item = await rig.seed('Photos/a.jpg', await grey(20, 20, 100));
    await expect(service.erase(rig.member, item.id, { strokes: STROKES })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(erased).toBe(0);
  });
});
