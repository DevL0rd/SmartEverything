import { describe, expect, it } from 'vitest';
import {
  abilityProblemsOf,
  OP_ABILITY,
  opNoticeOf,
  type FileAbilities,
  type FileLocation,
  type FileNode,
  type FileOp,
  type FileSource,
} from '../features/files';

export interface ContractHarness<O> {
  readonly source: FileSource<O>;
  readonly home: FileLocation;
  readonly trash: FileLocation | null;
  readonly list: (location: FileLocation) => Promise<readonly FileNode<O>[]>;
  readonly abilities: (location: FileLocation) => FileAbilities;
}

export type MakeHarness<O> = () => ContractHarness<O> | Promise<ContractHarness<O>>;

function firstOf<O>(nodes: readonly FileNode<O>[], folder: boolean): FileNode<O> {
  const found = nodes.find((node) => (node.kind === 'folder') === folder && node.writable);
  if (found === undefined)
    throw new Error(`the home folder needs a writable ${folder ? 'folder' : 'file'}`);
  return found;
}

function names<O>(nodes: readonly FileNode<O>[]): readonly string[] {
  return nodes.map((node) => node.name);
}

function folderOf<O>(home: FileLocation, folder: FileNode<O>): FileLocation {
  return { place: home.place, folder: folder.key };
}

function describeChanges<O>(make: MakeHarness<O>): void {
  it('creates and renames inside a writable folder', async () => {
    const rig = await make();
    if (!rig.abilities(rig.home).newFolder) return;
    const made = await rig.source.run({
      kind: 'new_folder',
      in: rig.home,
      name: 'Contract folder',
    });
    expect(made.failed).toEqual([]);
    expect(names(await rig.list(rig.home))).toContain('Contract folder');
    if (!rig.abilities(rig.home).rename) return;
    const node = (await rig.list(rig.home)).find((item) => item.name === 'Contract folder');
    if (node === undefined) throw new Error('the new folder is listed');
    await rig.source.run({ kind: 'rename', node, name: 'Renamed folder' });
    expect(names(await rig.list(rig.home))).toEqual(expect.arrayContaining(['Renamed folder']));
    expect(names(await rig.list(rig.home))).not.toContain('Contract folder');
  });

  it('copies keep the original and moves take the file away', async () => {
    const rig = await make();
    const abilities = rig.abilities(rig.home);
    if (!abilities.copy && !abilities.move) return;
    const entries = await rig.list(rig.home);
    const file = firstOf(entries, false);
    const folders = entries.filter((node) => node.kind === 'folder' && node.writable);
    const [copyInto, secondFolder] = folders.map((node) => folderOf(rig.home, node));
    if (copyInto === undefined) throw new Error('the home folder needs a writable folder');
    const moveInto = secondFolder ?? copyInto;
    if (abilities.copy) {
      const copied = await rig.source.run({ kind: 'copy', nodes: [file], to: copyInto });
      expect(copied.done).toEqual([file.key]);
      expect(names(await rig.list(rig.home))).toContain(file.name);
      expect(names(await rig.list(copyInto))).toContain(file.name);
      if (copied.undo !== null) {
        expect((await copied.undo()).failed).toEqual([]);
        expect(names(await rig.list(copyInto))).not.toContain(file.name);
        expect(names(await rig.list(rig.home))).toContain(file.name);
      }
    }
    if (!abilities.move || moveInto === copyInto) return;
    const moved = await rig.source.run({ kind: 'move', nodes: [file], to: moveInto });
    expect(moved.done).toEqual([file.key]);
    expect(names(await rig.list(rig.home))).not.toContain(file.name);
    expect(names(await rig.list(moveInto))).toContain(file.name);
    if (moved.undo === null) return;
    expect((await moved.undo()).failed).toEqual([]);
    expect(names(await rig.list(rig.home))).toContain(file.name);
    expect(names(await rig.list(moveInto))).not.toContain(file.name);
  });
}

function describeTrash<O>(make: MakeHarness<O>): void {
  it('trashes with an undo that brings the item back', async () => {
    const rig = await make();
    if (!rig.abilities(rig.home).trash) return;
    const file = firstOf(await rig.list(rig.home), false);
    const trashed = await rig.source.run({ kind: 'trash', nodes: [file] });
    expect(trashed.done).toEqual([file.key]);
    expect(names(await rig.list(rig.home))).not.toContain(file.name);
    if (rig.trash !== null && rig.abilities(rig.trash).trashView) {
      expect(names(await rig.list(rig.trash))).toContain(file.name);
    }
    if (trashed.undo === null) return;
    await trashed.undo();
    expect(names(await rig.list(rig.home))).toContain(file.name);
  });
}

function refusedOp<O>(
  abilities: FileAbilities,
  home: FileLocation,
  file: FileNode<O>,
): FileOp<O> | null {
  const candidates: readonly FileOp<O>[] = [
    { kind: 'new_folder', in: home, name: 'Refused' },
    { kind: 'rename', node: file, name: 'Refused' },
    { kind: 'trash', nodes: [file] },
    { kind: 'star', nodes: [file] },
  ];
  return candidates.find((op) => !abilities[OP_ABILITY[op.kind]]) ?? null;
}

function describeAbilities<O>(make: MakeHarness<O>): void {
  it('states a consistent ability set for the home folder', async () => {
    const rig = await make();
    expect(abilityProblemsOf(rig.abilities(rig.home))).toEqual([]);
  });

  it('refuses a change its abilities leave out', async () => {
    const rig = await make();
    const file = (await rig.list(rig.home)).find((node) => node.kind !== 'folder');
    if (file === undefined) return;
    const op = refusedOp(rig.abilities(rig.home), rig.home, file);
    if (op === null) return;
    const result = await rig.source.run(op);
    expect(result.done).toEqual([]);
    expect(result.undo).toBeNull();
  });

  it('reports a refused new folder as a failure', async () => {
    const rig = await make();
    if (rig.abilities(rig.home).newFolder) return;
    const op: FileOp<O> = { kind: 'new_folder', in: rig.home, name: 'Refused' };
    const result = await rig.source.run(op);
    expect(result.done).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(opNoticeOf(op, result).tone).toBe('failed');
  });

  it('prepares a file download for one exportable file', async () => {
    const rig = await make();
    if (!rig.abilities(rig.home).download) return;
    const file = (await rig.list(rig.home)).find(
      (node) => node.kind !== 'folder' && node.exportable,
    );
    if (file === undefined) return;
    const prepared = await rig.source.download([file]);
    expect(prepared.download.kind).toBe('file');
    expect(prepared.url).not.toBe('');
  });
}

export function describeSourceContract<O>(name: string, make: MakeHarness<O>): void {
  describe(`${name} meets the file source contract`, () => {
    describeAbilities(make);
    describeChanges(make);
    describeTrash(make);
  });
}
