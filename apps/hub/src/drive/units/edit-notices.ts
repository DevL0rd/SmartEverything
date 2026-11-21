import type { DriveFeedOp, DriveFeedRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { peopleWithAccess, type AudienceStore } from '../social/audience';

const log = new Logger('hub.drive');

const EDIT_OPS: ReadonlySet<DriveFeedOp> = new Set(['update', 'rename', 'move']);

const FEED_BATCH = 500;

type EditNoticeStore = AudienceStore & Pick<HostStore, 'driveFeed' | 'driveNotifications'>;

export interface EditNoticesPage {
  readonly last: number | null;
  readonly more: boolean;
}

function tell(store: EditNoticeStore, row: DriveFeedRow, editor: string): void {
  const item = store.driveItems.find(row.itemId, null);
  if (item === undefined) return;
  for (const person of peopleWithAccess(store, item)) {
    const watching =
      person.access === 'own' || person.access === 'edit' || person.access === 'view';
    if (!watching || person.profileId === editor) continue;
    store.driveNotifications.add({
      profileId: person.profileId,
      kind: 'edited',
      itemId: item.id,
      actorProfileId: editor,
      actorName: null,
      refId: null,
    });
  }
}

function rowWritten(store: EditNoticeStore, row: DriveFeedRow): void {
  if (!EDIT_OPS.has(row.op) || row.actorProfileId === null) return;
  try {
    tell(store, row, row.actorProfileId);
  } catch (cause) {
    log.error('drive.edit_notice_failed', cause, { itemId: row.itemId, seq: row.seq });
  }
}

function noticeEdits(store: EditNoticeStore, input: { readonly after: number }): EditNoticesPage {
  const window = store.driveFeed.since(input.after, FEED_BATCH);
  for (const row of window.rows) rowWritten(store, row);
  return { last: window.rows.at(-1)?.seq ?? null, more: window.next !== null };
}

export const DRIVE_EDIT_NOTICES_UNIT = storeUnit(noticeEdits);
