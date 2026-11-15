import { bytes } from '../../../format/number';
import { plural } from '../../../format/text';
import type { DownloadPlanView, DownloadSkip } from '../source/types';
import type {
  DownloadIntent,
  DownloadOutcome,
  DownloadState,
  DownloadTargets,
} from './download-flow';

export interface IntentSpec {
  readonly intent: DownloadIntent;
  readonly label: string;
  readonly icon: 'download' | 'externalLink' | 'share';
  readonly primary: boolean;
}

export type DownloadSheetView =
  | { readonly kind: 'closed' }
  | { readonly kind: 'preparing'; readonly line: string }
  | { readonly kind: 'failed'; readonly error: unknown; readonly targets: DownloadTargets }
  | {
      readonly kind: 'ready';
      readonly name: string;
      readonly facts: string;
      readonly skippedTitle: string | null;
      readonly skipped: readonly string[];
      readonly working: string | null;
      readonly done: string | null;
      readonly intents: readonly IntentSpec[];
      readonly busy: boolean;
    };

export function targetsTitleOf(targets: DownloadTargets): string {
  const [only] = targets;
  return targets.length === 1 && only !== undefined ? only.name : plural(targets.length, 'item');
}

export function factsOf(download: DownloadPlanView): string {
  if (download.kind === 'file') return bytes(download.size ?? download.bytes);
  const folders = download.folders > 0 ? `, ${plural(download.folders, 'folder')}` : '';
  return `Zip of ${plural(download.files, 'file')}${folders} · ${bytes(download.bytes)}`;
}

export function skippedTitleOf(skipped: readonly DownloadSkip[]): string | null {
  if (skipped.length === 0) return null;
  return `${plural(skipped.length, 'item')} can’t be included`;
}

export function skippedLinesOf(skipped: readonly DownloadSkip[]): readonly string[] {
  return skipped.map((item) => `${item.path} — ${item.reason}`);
}

export function doneTextOf(
  intent: DownloadIntent,
  outcome: DownloadOutcome,
  place: string,
): string {
  if (outcome === 'external') return 'The download started in your browser.';
  if (intent === 'save') return `Saved to ${place}.`;
  return intent === 'open' ? 'Opened.' : 'Shared.';
}

export function intentsOf(native: boolean): readonly IntentSpec[] {
  if (!native) return [{ intent: 'save', label: 'Download', icon: 'download', primary: true }];
  return [
    { intent: 'save', label: 'Save to this phone', icon: 'download', primary: true },
    { intent: 'open', label: 'Open', icon: 'externalLink', primary: false },
    { intent: 'share', label: 'Share', icon: 'share', primary: false },
  ];
}

function workingOf(intent: DownloadIntent, download: DownloadPlanView): string {
  return `${intent === 'save' ? 'Saving' : 'Fetching'} ${factsOf(download)}`;
}

export function downloadSheetOf(state: DownloadState, native: boolean): DownloadSheetView {
  switch (state.kind) {
    case 'idle':
      return { kind: 'closed' };
    case 'preparing':
      return { kind: 'preparing', line: `Getting ${targetsTitleOf(state.targets)} ready…` };
    case 'failed':
      return { kind: 'failed', error: state.error, targets: state.targets };
    case 'ready':
    case 'working':
    case 'done': {
      const { download } = state.prepared;
      return {
        kind: 'ready',
        name: download.name,
        facts: factsOf(download),
        skippedTitle: skippedTitleOf(download.skipped),
        skipped: skippedLinesOf(download.skipped),
        working: state.kind === 'working' ? workingOf(state.intent, download) : null,
        done:
          state.kind === 'done'
            ? doneTextOf(state.intent, state.outcome, native ? 'this phone' : 'this device')
            : null,
        intents: intentsOf(native),
        busy: state.kind === 'working',
      };
    }
  }
}
