import type { PluginSearchEntry, SyncthingSnapshot } from '@smarteverything/domain';
import { SYNCTHING_EXTERNAL_ID } from './sync-device';

const SYNCTHING_SECTIONS = {
  sync: 'sync',
  folders: 'folders',
  devices: 'devices',
  files: 'files',
} as const;

type Section = (typeof SYNCTHING_SECTIONS)[keyof typeof SYNCTHING_SECTIONS];

interface EntryText {
  readonly subtitle: string;
  readonly keywords: readonly string[];
  readonly query?: Readonly<Record<string, string>>;
}

function entry(
  id: string,
  title: string,
  section: Section | null,
  text: EntryText,
): PluginSearchEntry {
  return {
    id,
    title,
    subtitle: text.subtitle,
    keywords: [...text.keywords],
    target: {
      kind: 'device',
      externalId: SYNCTHING_EXTERNAL_ID,
      section,
      query: { ...text.query },
    },
  };
}

const PAGE_ENTRIES: readonly PluginSearchEntry[] = [
  entry('syncthing', 'Syncthing', null, {
    subtitle: 'File sync',
    keywords: ['sync', 'files', 'backup'],
  }),
  entry('syncthing.sync', 'Sync status', SYNCTHING_SECTIONS.sync, {
    subtitle: 'Syncthing',
    keywords: ['invitations', 'errors', 'pause', 'resume'],
  }),
  entry('syncthing.folders', 'Synced folders', SYNCTHING_SECTIONS.folders, {
    subtitle: 'Syncthing',
    keywords: ['rescan', 'override', 'revert'],
  }),
  entry('syncthing.devices', 'Sync devices', SYNCTHING_SECTIONS.devices, {
    subtitle: 'Syncthing',
    keywords: ['peers', 'computers', 'phones'],
  }),
  entry('syncthing.activity', 'File activity', SYNCTHING_SECTIONS.files, {
    subtitle: 'Syncthing',
    keywords: ['changes', 'recent files'],
  }),
];

export function syncthingSearchEntries(snapshot: SyncthingSnapshot): PluginSearchEntry[] {
  return [
    ...PAGE_ENTRIES,
    ...snapshot.folders.map((folder) =>
      entry(`syncthing.folder.${folder.id}`, folder.label, SYNCTHING_SECTIONS.folders, {
        subtitle: 'Synced folder',
        keywords: [folder.id, folder.path]
          .filter((keyword) => keyword.length > 0)
          .map((keyword) => keyword.slice(0, 60)),
        query: { folder: folder.id },
      }),
    ),
    ...snapshot.peers.map((peer) =>
      entry(`syncthing.device.${peer.id}`, peer.name, SYNCTHING_SECTIONS.devices, {
        subtitle: 'Sync device',
        keywords: [peer.id.slice(0, 7)],
        query: { device: peer.id },
      }),
    ),
  ];
}

export function syncthingSearchSignature(snapshot: SyncthingSnapshot): string {
  return [
    ...snapshot.folders.map((folder) => `f|${folder.id}|${folder.label}|${folder.path}`),
    ...snapshot.peers.map((peer) => `d|${peer.id}|${peer.name}`),
  ].join('\n');
}
