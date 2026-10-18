import { formatBytes, type SyncthingSnapshot } from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';
import { decimal } from '../../../format/number';
import { plural } from '../../../format/text';
import { duration, MINUTE_MS } from '../../../format/time';
import type { MedallionTone } from '../../shared/medallion-model';
import { overallCompletion, ringShare } from '../model/completion';
import type { FolderState } from '../model/folder-model';
import { SYNC_STATE_TEXT } from '../syncthing-data';

export interface StaleCaption {
  readonly short: string;
  readonly long: string;
  readonly critical: boolean;
}

export function shortStateOf(state: FolderState): string {
  return state.glyph === null ? `${decimal(state.percent)} %` : state.text;
}

export interface SyncStatus {
  readonly word: string;
  readonly textTone: StatusTone | 'variant';
  readonly medallionTone: MedallionTone;
  readonly share: number | null;
  readonly percent: number | null;
  readonly left: string;
  readonly live: boolean;
}

export function devicesLine(summary: SyncthingSnapshot['summary']): string {
  return summary.peersTotal === 0
    ? 'No other devices'
    : `${String(summary.peersOnline)} of ${plural(summary.peersTotal, 'device')} connected`;
}

function shareOf(snapshot: SyncthingSnapshot): number | null {
  const { state } = snapshot.summary;
  if (state === 'in_sync') {
    return 1;
  }
  return state === 'empty' ? null : overallCompletion(snapshot.folders);
}

export function statusOf(snapshot: SyncthingSnapshot): SyncStatus {
  const { summary } = snapshot;
  const text = SYNC_STATE_TEXT[summary.state];
  const share = shareOf(snapshot);
  return {
    word: text.title,
    textTone: text.tone,
    medallionTone: text.tone === 'variant' ? 'neutral' : text.tone,
    share: share === null ? null : ringShare(Math.floor(share * 100)),
    percent: share === null ? null : Math.floor(share * 100),
    left:
      summary.state === 'syncing' && summary.needBytes > 0
        ? `${formatBytes(summary.needBytes)} left`
        : devicesLine(summary),
    live: snapshot.ratesLive && summary.downloadBytesPerSecond + summary.uploadBytesPerSecond > 0,
  };
}

export function spokenStatus(status: SyncStatus, stale: StaleCaption | null): string {
  if (stale !== null) {
    return stale.long;
  }
  return status.percent === null
    ? status.word
    : `${status.word}, ${decimal(status.percent)} percent complete`;
}

export function invitationCount(snapshot: SyncthingSnapshot): number {
  return snapshot.pendingDevices.length + snapshot.pendingFolders.length;
}

export function staleOf(
  connection: SyncthingSnapshot['connection'],
  now: number,
): StaleCaption | null {
  switch (connection.state) {
    case 'unreachable': {
      const minutes = Math.max(1, Math.floor((now - Date.parse(connection.since)) / MINUTE_MS));
      const elapsed = duration(minutes * 60);
      return {
        short: `Offline · ${elapsed}`,
        long: `Can’t reach Syncthing · ${elapsed}`,
        critical: true,
      };
    }
    case 'key_rejected':
      return {
        short: 'Key rejected',
        long: 'Syncthing rejected the API key',
        critical: true,
      };
    case 'connecting':
      return { short: 'Connecting…', long: 'Connecting…', critical: false };
    case 'online':
    case 'not_set_up':
      return null;
  }
}
