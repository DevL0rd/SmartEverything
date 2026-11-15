import { describe, expect, it } from 'vitest';
import type { DriveItemLink } from '@smarteverything/domain';
import { AT, MEMBER_ID, ROOT_ID, documentFixture, folderFixture } from '../data/fixtures';
import {
  DriveDownloadRefusedError,
  driveDownloadOf,
  type DriveDownloadEnv,
} from './drive-download';
import { driveNodeOf, shortcutNodeOf } from './drive-node';
import { idOf, worldContext } from './drive-fixture';

const WHEN = '2026-11-15T12:00:00.000Z';

function linkOf(itemId: string, download: boolean): DriveItemLink {
  const link = { url: `https://hub.test/f/${itemId}`, expiresAt: WHEN };
  return {
    itemId,
    rev: 1,
    file: link,
    download: download ? link : null,
    icon: null,
    thumb: null,
    preview: null,
    playable: null,
  };
}

function envOf(download: boolean): DriveDownloadEnv & { readonly zipped: string[][] } {
  const zipped: string[][] = [];
  return {
    zipped,
    links: (ids) => Promise.resolve(ids.map((id) => linkOf(id, download))),
    prepare: (ids): ReturnType<DriveDownloadEnv['prepare']> => {
      zipped.push([...ids]);
      return Promise.resolve({
        url: 'https://hub.test/zip/1',
        download: {
          kind: 'zip',
          name: 'Download.zip',
          size: null,
          files: 2,
          folders: 1,
          bytes: 300,
          skipped: [{ path: 'secret.pdf', reason: 'View only' }],
          url: 'https://hub.test/zip/1',
          expiresAt: WHEN,
        },
      });
    },
  };
}

const context = worldContext();
const FILE = driveNodeOf(documentFixture({ id: idOf(1), name: 'Plan.pdf', bytes: 2048 }), context);
const OTHER = driveNodeOf(documentFixture({ id: idOf(2), name: 'Memo.pdf' }), context);
const FOLDER = driveNodeOf(folderFixture({ id: idOf(3), name: 'Docs' }), context);
const ALIAS = shortcutNodeOf(
  {
    id: idOf(9),
    rootId: ROOT_ID,
    parentId: null,
    name: 'Alias.pdf',
    createdBy: MEMBER_ID,
    createdAt: AT,
    target: { state: 'available', item: documentFixture({ id: idOf(4), name: 'Real.pdf' }) },
  },
  context,
);

describe('drive downloads', () => {
  it('hands one file over by its own download link', async () => {
    const env = envOf(true);
    const prepared = await driveDownloadOf([FILE], env);
    expect(prepared.url).toBe(`https://hub.test/f/${idOf(1)}`);
    expect(prepared.download).toMatchObject({
      kind: 'file',
      name: 'Plan.pdf',
      size: 2048,
      files: 1,
      folders: 0,
      skipped: [],
    });
    expect(env.zipped).toEqual([]);
  });

  it('refuses one file the person may only view', async () => {
    await expect(driveDownloadOf([FILE], envOf(false))).rejects.toBeInstanceOf(
      DriveDownloadRefusedError,
    );
  });

  it('prepares one zip for a folder or for several items and reports what was left out', async () => {
    const env = envOf(true);
    const folder = await driveDownloadOf([FOLDER], env);
    const several = await driveDownloadOf([FILE, OTHER], env);
    expect(env.zipped).toEqual([[idOf(3)], [idOf(1), idOf(2)]]);
    expect(folder.download).toMatchObject({
      kind: 'zip',
      skipped: [{ path: 'secret.pdf', reason: 'View only' }],
    });
    expect(several.url).toBe('https://hub.test/zip/1');
  });

  it('downloads a shortcut through its target, alone and beside other items', async () => {
    const env = envOf(true);
    const alone = await driveDownloadOf([ALIAS], env);
    expect(alone.url).toBe(`https://hub.test/f/${idOf(4)}`);
    expect(alone.download).toMatchObject({ kind: 'file', name: 'Alias.pdf' });
    await driveDownloadOf([ALIAS, FILE], env);
    expect(env.zipped).toEqual([[idOf(4), idOf(1)]]);
  });

  it('refuses nothing to download', async () => {
    await expect(driveDownloadOf([], envOf(true))).rejects.toBeInstanceOf(
      DriveDownloadRefusedError,
    );
  });
});
