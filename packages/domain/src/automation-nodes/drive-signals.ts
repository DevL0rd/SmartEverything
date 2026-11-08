import { z } from 'zod';
import { DRIVE_ITEM_KINDS } from '../drive/item';
import { DRIVE_VIA } from '../drive/feed';
import type { SignalSourceSpec } from '../signal-sources/spec';
import { SIGNAL_INPUT } from '../signals';

const ID = z.uuid();
const PATH = z.string().min(1);

export const DRIVE_SIGNAL_SOURCE = 'drive';

export const DRIVE_ITEM_ADDED_KIND = 'item_added';

export const DRIVE_CONFLICT_KIND = 'conflict';

export const DRIVE_INTEGRITY_KIND = 'integrity_failed';

const BASE = {
  ...SIGNAL_INPUT.shape,
  source: z.literal(DRIVE_SIGNAL_SOURCE),
  subject: z.null(),
  field: z.null(),
};

const ITEM_ADDED_DATA = z.strictObject({
  itemId: ID,
  rootId: ID,
  folderId: ID.nullable(),
  name: PATH,
  relPath: PATH,
  kind: z.enum(DRIVE_ITEM_KINDS),
  via: z.enum(DRIVE_VIA),
  addedByProfileId: ID.nullable(),
});

const CONFLICT_DATA = z.strictObject({
  conflictId: ID,
  rootId: ID,
  itemId: ID,
  conflictItemId: ID,
  relPath: PATH,
  conflictRelPath: PATH,
  deviceId: ID,
});

const INTEGRITY_DATA = z.strictObject({
  rootId: ID,
  itemId: ID,
  relPath: PATH,
});

export const DRIVE_SIGNAL = z.discriminatedUnion('kind', [
  z.strictObject({ ...BASE, kind: z.literal(DRIVE_ITEM_ADDED_KIND), data: ITEM_ADDED_DATA }),
  z.strictObject({ ...BASE, kind: z.literal(DRIVE_CONFLICT_KIND), data: CONFLICT_DATA }),
  z.strictObject({ ...BASE, kind: z.literal(DRIVE_INTEGRITY_KIND), data: INTEGRITY_DATA }),
]);

export type DriveSignal = z.infer<typeof DRIVE_SIGNAL>;

const ROOT_MATCH = { key: 'rootId', label: 'The library folder', values: null } as const;

export const DRIVE_SIGNALS: SignalSourceSpec = {
  source: DRIVE_SIGNAL_SOURCE,
  label: 'Photos and Drive',
  kinds: [
    {
      kind: DRIVE_ITEM_ADDED_KIND,
      label: 'An item is added to the library',
      subject: 'none',
      fields: [],
      match: [
        ROOT_MATCH,
        { key: 'folderId', label: 'The folder it is in', values: null },
        { key: 'kind', label: 'What kind of item', values: DRIVE_ITEM_KINDS },
      ],
      pulse: true,
    },
    {
      kind: DRIVE_CONFLICT_KIND,
      label: 'A synced file got a conflict copy',
      subject: 'none',
      fields: [],
      match: [ROOT_MATCH],
      pulse: true,
      feed: true,
    },
    {
      kind: DRIVE_INTEGRITY_KIND,
      label: 'A library file failed its integrity check',
      subject: 'none',
      fields: [],
      match: [ROOT_MATCH],
      pulse: true,
      feed: true,
      urgent: true,
    },
  ],
};
