import { QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  FILE_ABILITIES,
  FILE_WRITE_CHANGE,
  type ComputerDownload,
  type FileAbility,
  type FileEntry,
  type FilePlaces,
  type FileWriteResult,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

interface Call {
  readonly body?: unknown;
}

type Handler = (endpoint: unknown, input: Call) => Promise<unknown>;

const hub = vi.hoisted((): { handle: Handler } => ({
  handle: () => Promise.reject(new Error('No hub is set up')),
}));

vi.mock('../../../api/transport', () => ({
  api: (): unknown => ({
    call: (endpoint: unknown, input: Call): Promise<unknown> => hub.handle(endpoint, input),
    forMedia: (): unknown => ({
      call: (endpoint: unknown, input: Call): Promise<unknown> => hub.handle(endpoint, input),
      resourceUrl: (path: string): Promise<string> => Promise.resolve(`https://hub.test${path}`),
    }),
  }),
}));

import { abilitiesAtOf, computerAbilitiesOf } from './computer-abilities';
import {
  describeSourceContract,
  type ContractHarness,
} from '../../../test-support/file-source-contract';
import type { FileLocation, FileNode } from '../../files';
import { nodeOfEntry, nodeOfTrash, type ComputerOrigin } from './computer-node';
import { pathOfLocation } from './computer-ops';
import { baseName, parentOf } from './computer-path';
import { placesKey } from './computer-keys';
import { createComputerSource } from './computer-source';

const DEVICE = '0b9f3c2e-3c38-4a4f-9d55-6a1f6d4b2a10';

const HOME = '/home/dana';

const MOMENT = '2026-11-14T10:00:00.000Z';

const LINUX: readonly FileAbility[] = [...FILE_ABILITIES];

const READ_ONLY: readonly FileAbility[] = ['search', 'properties', 'download', 'zip', 'watch'];

function fileEntry(path: string, kind: FileEntry['kind'], mime: string | null): FileEntry {
  return {
    name: baseName(path),
    path,
    kind,
    mime,
    size: kind === 'folder' ? 4096 : 1200,
    modifiedAt: MOMENT,
    hidden: false,
  };
}

type Done = FileWriteResult['done'][number];

class Fs {
  readonly files: Map<string, FileEntry>;
  readonly bin = new Map<string, FileEntry>();
  private sequence = 0;

  constructor(entries: readonly FileEntry[]) {
    this.files = new Map(entries.map((entry) => [entry.path, entry]));
  }

  apply(body: unknown): FileWriteResult {
    const change = FILE_WRITE_CHANGE.parse(body);
    switch (change.action) {
      case 'new_folder':
        this.files.set(change.path, fileEntry(change.path, 'folder', null));
        return { done: [{ path: change.path, newPath: change.path, trashId: null }], failed: [] };
      case 'rename':
        return this.moved([change.path], parentOf(change.path) ?? '', change.name);
      case 'move':
        return this.moved(change.paths, change.to, null);
      case 'copy':
        return this.copied(change.paths, change.to);
      case 'trash':
        return { done: change.paths.map((path) => this.discard(path)), failed: [] };
      case 'restore':
        return { done: change.items.map((id) => this.bring(id)), failed: [] };
      case 'delete_now':
        return { done: change.items.map((id) => this.erase(id)), failed: [] };
    }
  }

  private moved(paths: readonly string[], folder: string, name: string | null): FileWriteResult {
    const done = paths.map((path): Done => {
      const entry = this.files.get(path);
      const target = `${folder}/${name ?? baseName(path)}`;
      if (entry !== undefined) {
        this.files.delete(path);
        this.files.set(target, { ...entry, path: target, name: baseName(target) });
      }
      return { path, newPath: target, trashId: null };
    });
    return { done, failed: [] };
  }

  private copied(paths: readonly string[], folder: string): FileWriteResult {
    const done = paths.map((path): Done => {
      const entry = this.files.get(path);
      const target = `${folder}/${baseName(path)}`;
      if (entry !== undefined) this.files.set(target, { ...entry, path: target });
      return { path, newPath: target, trashId: null };
    });
    return { done, failed: [] };
  }

  private discard(path: string): Done {
    this.sequence += 1;
    const id = `bin-${String(this.sequence)}`;
    const entry = this.files.get(path);
    if (entry !== undefined) this.bin.set(id, entry);
    this.files.delete(path);
    return { path, newPath: null, trashId: id };
  }

  private bring(id: string): Done {
    const entry = this.bin.get(id);
    if (entry !== undefined) this.files.set(entry.path, entry);
    this.bin.delete(id);
    return { path: id, newPath: null, trashId: null };
  }

  private erase(id: string): Done {
    this.bin.delete(id);
    return { path: id, newPath: null, trashId: null };
  }
}

function seeded(): Fs {
  return new Fs([
    fileEntry(`${HOME}/Documents`, 'folder', null),
    fileEntry(`${HOME}/Projects`, 'folder', null),
    fileEntry(`${HOME}/notes.txt`, 'file', 'text/plain'),
    fileEntry(`${HOME}/report.pdf`, 'file', 'application/pdf'),
  ]);
}

function download(entry: FileEntry | undefined): ComputerDownload {
  return {
    kind: 'file',
    name: entry?.name ?? 'file',
    size: entry?.size ?? 0,
    files: 1,
    folders: 0,
    bytes: entry?.size ?? 0,
    skipped: [],
    url: '/media/computer-downloads/ticket',
    expiresAt: '2026-11-14T11:00:00.000Z',
  };
}

function hubOf(fs: Fs): Handler {
  return (endpoint, input) => {
    if (endpoint === E.writeComputerFiles) return Promise.resolve(fs.apply(input.body));
    if (endpoint === E.prepareComputerDownload) {
      return Promise.resolve(download([...fs.files.values()][0]));
    }
    return Promise.reject(new Error('Unexpected call'));
  };
}

function placesOf(granted: readonly FileAbility[]): FilePlaces {
  return {
    home: HOME,
    abilities: [...granted],
    places: [{ label: 'Home', path: HOME, kind: 'home' }],
  };
}

function harnessOf(
  granted: readonly FileAbility[],
  fs: Fs = seeded(),
): ContractHarness<ComputerOrigin> & { readonly fs: Fs } {
  hub.handle = hubOf(fs);
  const client = new QueryClient();
  client.setQueryData(placesKey(DEVICE), placesOf(granted));
  const source = createComputerSource({
    deviceId: DEVICE,
    label: 'Workstation',
    client,
    attach: null,
  });
  const writable = granted.includes('write');
  const nodeOf = (location: FileLocation): readonly FileNode<ComputerOrigin>[] =>
    location.place === 'trash'
      ? [...fs.bin].map(([trashId, entry]) =>
          nodeOfTrash({
            trashId,
            name: entry.name,
            originalPath: entry.path,
            deletedAt: MOMENT,
            size: entry.size,
            kind: entry.kind,
          }),
        )
      : [...fs.files.values()]
          .filter((entry) => parentOf(entry.path) === pathOfLocation(location))
          .map((entry) => nodeOfEntry(entry, writable, []));
  return {
    fs,
    source,
    home: { place: HOME, folder: null },
    trash: { place: 'trash', folder: null },
    list: (location) => Promise.resolve(nodeOf(location)),
    abilities: (location) =>
      abilitiesAtOf(computerAbilitiesOf(granted), location.place === 'trash'),
  };
}

describeSourceContract('the Linux computer source', () => harnessOf(LINUX));

describeSourceContract('the read only computer source', () => harnessOf(READ_ONLY));

describe('computer source', () => {
  it('moves a file to Trash by path and restores it by trash id with the undo', async () => {
    const rig = harnessOf(LINUX);
    const [file] = (await rig.list(rig.home)).filter((node) => node.name === 'notes.txt');
    if (file === undefined) throw new Error('notes.txt is listed');
    const trashed = await rig.source.run({ kind: 'trash', nodes: [file] });
    expect(trashed.done).toEqual([`${HOME}/notes.txt`]);
    expect(trashed.undo).not.toBeNull();
    const [binned] = await rig.list({ place: 'trash', folder: null });
    expect(binned?.origin.trashId).toBe('bin-1');
    const restored = await rig.source.run({
      kind: 'restore',
      nodes: binned === undefined ? [] : [binned],
    });
    expect(restored.done).toEqual(['bin-1']);
    expect(rig.fs.files.has(`${HOME}/notes.txt`)).toBe(true);
  });

  it('deletes Trash items for good by trash id', async () => {
    const rig = harnessOf(LINUX);
    const [file] = (await rig.list(rig.home)).filter((node) => node.name === 'report.pdf');
    if (file === undefined) throw new Error('report.pdf is listed');
    await rig.source.run({ kind: 'trash', nodes: [file] });
    const binned = await rig.list({ place: 'trash', folder: null });
    const result = await rig.source.run({ kind: 'delete_now', nodes: binned });
    expect(result.done).toEqual(['bin-1']);
    expect(rig.fs.bin.size).toBe(0);
  });

  it('answers a failed new folder with a failure for it so it is not reported as made', async () => {
    const rig = harnessOf(LINUX);
    hub.handle = (): Promise<unknown> => Promise.reject(new Error('Permission denied'));
    const result = await rig.source.run({
      kind: 'new_folder',
      in: rig.home,
      name: 'Blocked',
    });
    expect(result.done).toEqual([]);
    expect(result.failed.map((failure) => failure.key)).toEqual([`${HOME}/Blocked`]);
  });

  it('refuses a star on a computer without asking it', async () => {
    const rig = harnessOf(LINUX);
    const [file] = await rig.list(rig.home);
    if (file === undefined) throw new Error('the home folder has entries');
    const result = await rig.source.run({ kind: 'star', nodes: [file] });
    expect(result.done).toEqual([]);
    expect(result.failed).toHaveLength(1);
  });

  it('refuses a change the computer does not support', async () => {
    const rig = harnessOf(READ_ONLY);
    const [file] = await rig.list(rig.home);
    if (file === undefined) throw new Error('the home folder has entries');
    const result = await rig.source.run({ kind: 'trash', nodes: [file] });
    expect(result.done).toEqual([]);
    expect(rig.fs.files.has(file.key)).toBe(true);
  });

  it('turns a typed path into a location under its root and refuses a relative one', () => {
    const { source } = harnessOf(LINUX);
    expect(source.locationOf(' /etc/ssh ')).toEqual({ place: '/', folder: '/etc/ssh' });
    expect(source.locationOf('relative/path')).toBeNull();
    expect(source.locationOf('')).toBeNull();
  });

  it('adds Add to chat only for files the chat can take', async () => {
    const rig = harnessOf(LINUX);
    const attach = vi.fn();
    const client = new QueryClient();
    const source = createComputerSource({ deviceId: DEVICE, label: 'W', client, attach });
    const nodes = await rig.list(rig.home);
    const folder = nodes.find((node) => node.kind === 'folder');
    const file = nodes.find((node) => node.kind !== 'folder');
    if (folder === undefined || file === undefined) throw new Error('home has both kinds');
    expect(source.actions([file]).map((action) => action.id)).toEqual(['attach']);
    expect(source.actions([folder])).toEqual([]);
    expect(source.actions([file, folder])).toEqual([]);
    expect(rig.source.actions([file])).toEqual([]);
  });
});
