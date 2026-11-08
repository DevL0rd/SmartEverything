import { messageOf } from '@smarteverything/logging';
import { safeName } from './destination';
import {
  awaitPicked,
  closeSession,
  createSession,
  pickedDownload,
  pickedPage,
  type PickWait,
} from './picker-source';
import type { PickedItem } from './schemas';
import { PHOTOS_FOLDER } from './scopes';
import { transferItem, type Fetched, type RunContext } from './transfer';

async function copyPicked(context: RunContext, item: PickedItem): Promise<Fetched> {
  const download = pickedDownload(item);
  if (download === null) {
    return { kind: 'skipped', reason: 'video_not_ready' };
  }
  const taken = new Date(item.createTime);
  const iso = taken.toISOString();
  return context.destination.place({
    segments: [PHOTOS_FOLDER, iso.slice(0, 4), iso.slice(0, 7)],
    name: safeName(download.name, 'Photo'),
    modifiedAt: taken,
    source: await context.http.bytes(download.url),
  });
}

export async function runPhotos(context: RunContext, pick: PickWait): Promise<void> {
  const session = await createSession(context.http);
  try {
    if (!(await awaitPicked(context.http, session, pick))) {
      context.log.warn('google_import.pick_timed_out', { importId: context.importId });
      return;
    }
    let cursor: string | null = null;
    do {
      const page = await pickedPage(context.http, session.id, cursor);
      for (const item of page.items) {
        await transferItem(context, 'photos', item.id, () => copyPicked(context, item));
      }
      cursor = page.next;
    } while (cursor !== null);
  } finally {
    await closeSession(context.http, session.id).catch((cause: unknown) => {
      context.log.warn('google_import.session_close_failed', { error: messageOf(cause) });
    });
  }
}
