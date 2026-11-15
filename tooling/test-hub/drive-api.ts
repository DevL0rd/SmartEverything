import { randomBytes } from 'node:crypto';
import type { NODE_HELLO } from '@smarteverything/domain';
import {
  API_ENDPOINTS as E,
  NODE_PROTOCOL_VERSION,
  type DriveItem,
  type DriveRoot,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { HubApi } from './api.ts';
import { DAY_MS } from './clock.ts';
import type { Counted, PersonRef, SeedContext } from './context.ts';

export async function rootsOf(api: HubApi): Promise<readonly DriveRoot[]> {
  return api.call(E.listRoots);
}

export async function scanAll(api: HubApi): Promise<number> {
  const roots = await rootsOf(api);
  for (const root of roots) await api.call(E.scanRoot, { params: { rootId: root.id } });
  return roots.length;
}

export async function childrenOf(
  api: HubApi,
  rootId: string,
  folderId: string | undefined,
): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.call(E.browseFolder, {
      query: {
        rootId,
        ...(folderId === undefined ? {} : { folderId }),
        ...(cursor === undefined ? {} : { cursor }),
      },
    });
    items.push(...page.items);
    cursor = page.next ?? undefined;
  } while (cursor !== undefined);
  return items;
}

export async function itemAt(api: HubApi, rootId: string, path: string): Promise<DriveItem> {
  let folder: string | undefined;
  let found: DriveItem | undefined;
  for (const segment of path.split('/')) {
    found = (await childrenOf(api, rootId, folder)).find((item) => item.name === segment);
    if (found === undefined) throw new Error(`The seeded path ${path} is missing from the drive.`);
    folder = found.id;
  }
  if (found === undefined) throw new Error('An empty path names no item.');
  return found;
}

export async function filesBelow(api: HubApi, rootId: string, path: string): Promise<DriveItem[]> {
  const folder = await itemAt(api, rootId, path);
  return (await childrenOf(api, rootId, folder.id)).filter((item) => item.kind !== 'folder');
}

function hello(hostname: string, machineId: string): z.input<typeof NODE_HELLO> {
  return {
    protocol: NODE_PROTOCOL_VERSION,
    machineId,
    hostname,
    os: { name: 'linux', kernel: 'synthetic' },
    hardware: { vendor: null, product: null, portable: hostname === 'seed-laptop' },
    cpu: { model: 'synthetic', threads: 8, hybrid: false },
    memoryBytes: 16 * 1024 ** 3,
    interfaces: [],
    bootedAt: new Date().toISOString(),
  };
}

async function pair(api: HubApi, hostname: string): Promise<string> {
  const pairing = await api.call(E.pairComputerNode, {
    body: { url: 'https://seed-hub.test:7882' },
  });
  const paired = await api.call(E.claimComputerNode, {
    body: { code: pairing.code, hello: hello(hostname, randomBytes(16).toString('hex')) },
  });
  return paired.device_id;
}

interface Scene {
  readonly api: HubApi;
  readonly anchor: SeedContext['anchor'];
  readonly owner: PersonRef;
  readonly member: PersonRef;
  readonly second: PersonRef;
  readonly ownerRoot: DriveRoot;
  readonly homeRoot: DriveRoot;
}

async function sceneOf(context: SeedContext): Promise<Scene> {
  const roots = await rootsOf(context.api);
  const [owner, member, second] = context.people;
  const ownerRoot = roots.find(
    (root) => root.scope === 'person' && root.ownerProfileId === owner?.id,
  );
  const homeRoot = roots.find((root) => root.scope === 'home');
  if (
    owner === undefined ||
    member === undefined ||
    second === undefined ||
    ownerRoot === undefined ||
    homeRoot === undefined
  )
    throw new Error('The household drive roots are incomplete.');
  return { api: context.api, anchor: context.anchor, owner, member, second, ownerRoot, homeRoot };
}

async function organise(scene: Scene): Promise<Counted> {
  const { api, ownerRoot } = scene;
  const notes = await filesBelow(api, ownerRoot.id, 'Documents/Notes');
  const finance = await filesBelow(api, ownerRoot.id, 'Documents/Finance');
  const starred = [...notes.slice(0, 4), ...finance.slice(0, 2)].map((item) => item.id);
  await api.call(E.changeDrive, { body: { action: 'star', itemIds: starred } });
  const colours = [
    ['Documents', 'viz-2'],
    ['Pictures', 'viz-4'],
    ['Projects', 'viz-6'],
  ] as const;
  for (const [path, colour] of colours) {
    const folder = await itemAt(api, ownerRoot.id, path);
    await api.call(E.setFolderColour, { body: { itemId: folder.id, colour } });
  }
  const large = await filesBelow(api, ownerRoot.id, 'Large');
  const spare = large.at(-1);
  if (spare !== undefined)
    await api.call(E.changeDrive, { body: { action: 'trash', itemIds: [spare.id] } });
  return { starred: starred.length, colours: colours.length, trashed: spare === undefined ? 0 : 1 };
}

async function sharing(scene: Scene): Promise<Counted> {
  const { api, anchor, ownerRoot, homeRoot, member, second } = scene;
  const future = new Date(anchor.now.getTime() + 30 * DAY_MS).toISOString();
  const documents = await itemAt(api, ownerRoot.id, 'Documents');
  const grants = [
    { itemId: documents.id, profileId: member.id, role: 'view', expiresAt: null },
    {
      itemId: (await itemAt(api, ownerRoot.id, 'Projects')).id,
      profileId: member.id,
      role: 'edit',
      expiresAt: future,
    },
    {
      itemId: (await itemAt(api, ownerRoot.id, 'Pictures')).id,
      profileId: second.id,
      role: 'view',
      expiresAt: null,
    },
  ] as const;
  for (const grant of grants) await api.call(E.setGrant, { body: grant });
  const notes = await filesBelow(api, ownerRoot.id, 'Documents/Notes');
  const finance = await filesBelow(api, ownerRoot.id, 'Documents/Finance');
  const first = notes[0];
  if (first === undefined) throw new Error('The seeded notes are missing.');
  const thread = await api.call(E.addComment, {
    params: { itemId: first.id },
    body: { body: 'Please review before Friday.', parentId: null, mentions: [member.id] },
  });
  await api.call(E.addComment, {
    params: { itemId: first.id },
    body: { body: 'Looks good to me.', parentId: thread.id, mentions: [] },
  });
  await api.call(E.addComment, {
    params: { itemId: finance[0]?.id ?? first.id },
    body: { body: 'The totals need a second look.', parentId: null, mentions: [] },
  });
  const recipes = await itemAt(api, homeRoot.id, 'Recipes');
  await api.call(E.createShortcut, {
    body: {
      targetItemId: recipes.id,
      place: { kind: 'folder', folderId: documents.id },
      name: 'Recipes shortcut',
    },
  });
  return { grants: grants.length, comments: 3, shortcuts: 1 };
}

const PLACEMENTS: readonly (readonly [
  string,
  'owner' | 'home',
  string | null,
  'synced' | 'mounted',
])[] = [
  ['seed-workstation', 'owner', 'Documents', 'synced'],
  ['seed-workstation', 'home', null, 'mounted'],
  ['seed-laptop', 'owner', null, 'mounted'],
];

async function mounts(scene: Scene): Promise<Counted> {
  const { api, ownerRoot, homeRoot } = scene;
  const devices = new Map<string, string>();
  for (const hostname of ['seed-workstation', 'seed-laptop'])
    devices.set(hostname, await pair(api, hostname));
  for (const [hostname, target, folder, mode] of PLACEMENTS) {
    const rootId = target === 'owner' ? ownerRoot.id : homeRoot.id;
    const deviceId = devices.get(hostname);
    if (deviceId === undefined) throw new Error(`The computer ${hostname} was not paired.`);
    const folderItemId = folder === null ? null : (await itemAt(api, rootId, folder)).id;
    const common = { deviceId, rootId, folderItemId, enabled: true };
    await api.call(E.setPlacement, {
      body:
        mode === 'synced'
          ? {
              ...common,
              mode,
              localPath: `/home/seed/${folder ?? 'Drive'}`,
              mountName: null,
              excluded: [],
              ignorePatterns: ['*.tmp'],
              conflictCopies: true,
            }
          : { ...common, mode, localPath: null, mountName: target === 'home' ? 'Home' : 'Drive' },
    });
  }
  return { computers: devices.size, placements: PLACEMENTS.length };
}

export async function seedDriveApi(context: SeedContext): Promise<Counted> {
  const scene = await sceneOf(context);
  return {
    ...(await organise(scene)),
    ...(await sharing(scene)),
    ...(await mounts(scene)),
  };
}
