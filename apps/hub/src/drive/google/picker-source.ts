import { PICKED_PAGE, PICKER_SESSION, type PickedItem, type PickerSession } from './schemas';
import type { GoogleHttp } from './http';
import { PICKER_API } from './scopes';

export type Wait = (ms: number, signal: AbortSignal) => Promise<void>;

export interface PickWait {
  readonly wait: Wait;
  readonly signal: AbortSignal;
  readonly announce: (session: PickerSession) => void;
}

export function createSession(http: GoogleHttp): Promise<PickerSession> {
  return http.json(PICKER_SESSION, `${PICKER_API}/sessions`, { method: 'POST', body: '{}' });
}

export async function awaitPicked(
  http: GoogleHttp,
  created: PickerSession,
  pick: PickWait,
): Promise<boolean> {
  pick.announce(created);
  let waited = 0;
  for (;;) {
    const session = await http.json(
      PICKER_SESSION,
      `${PICKER_API}/sessions/${encodeURIComponent(created.id)}`,
    );
    if (session.mediaItemsSet === true) {
      return true;
    }
    const polling = session.pollingConfig;
    if (polling === undefined || polling.timeoutIn === 0 || waited >= polling.timeoutIn) {
      return false;
    }
    await pick.wait(polling.pollInterval, pick.signal);
    waited += polling.pollInterval;
  }
}

export interface PickedPage {
  readonly items: readonly PickedItem[];
  readonly next: string | null;
}

export async function pickedPage(
  http: GoogleHttp,
  sessionId: string,
  cursor: string | null,
): Promise<PickedPage> {
  const params = new URLSearchParams({ sessionId });
  if (cursor !== null) {
    params.set('pageToken', cursor);
  }
  const page = await http.json(PICKED_PAGE, `${PICKER_API}/mediaItems?${params.toString()}`);
  return { items: page.mediaItems ?? [], next: page.nextPageToken ?? null };
}

export function closeSession(http: GoogleHttp, sessionId: string): Promise<void> {
  return http.remove(`${PICKER_API}/sessions/${encodeURIComponent(sessionId)}`);
}

export interface PickedDownload {
  readonly name: string;
  readonly url: string;
}

export function pickedDownload(item: PickedItem): PickedDownload | null {
  const { mediaFile } = item;
  if (item.type === 'VIDEO') {
    const status = mediaFile.mediaFileMetadata?.videoMetadata?.processingStatus;
    return status === undefined || status === 'READY'
      ? { name: mediaFile.filename, url: `${mediaFile.baseUrl}=dv` }
      : null;
  }
  return { name: mediaFile.filename, url: `${mediaFile.baseUrl}=d` };
}
