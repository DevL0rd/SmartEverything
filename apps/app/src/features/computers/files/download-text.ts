import type { ComputerDownload } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { plural } from '../../../format/text';
import type { DownloadIntent, DownloadOutcome, DownloadTarget } from './download-flow';

export function targetsTitle(targets: readonly DownloadTarget[]): string {
  const [only] = targets;
  return targets.length === 1 && only !== undefined ? only.name : plural(targets.length, 'item');
}

export function downloadFacts(download: ComputerDownload): string {
  if (download.kind === 'file') return bytes(download.bytes);
  const folders = download.folders > 1 ? `, ${plural(download.folders - 1, 'folder')}` : '';
  return `Zip of ${plural(download.files, 'file')}${folders} · ${bytes(download.bytes)}`;
}

export function skippedHeading(count: number): string {
  return `${plural(count, 'item')} can’t be included`;
}

export function doneText(intent: DownloadIntent, outcome: DownloadOutcome, place: string): string {
  if (outcome === 'external') return 'The download started in your browser.';
  if (intent === 'save') return `Saved to ${place}.`;
  return intent === 'open' ? 'Opened.' : 'Shared.';
}
