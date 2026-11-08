import type { DriveWatcherState } from '@smarteverything/domain';
import type { Tone } from '../../../components/tone';

export interface WatcherLine {
  readonly text: string;
  readonly tone: Tone;
}

const WATCHER_LINE: Readonly<Record<DriveWatcherState, WatcherLine>> = {
  watching: { text: 'Changes are seen as they happen', tone: 'positive' },
  reconciling: { text: 'Catching up with changes made while it was not watching', tone: 'info' },
  unavailable: {
    text: 'Changes are found only when a folder is opened or rescanned. The hub’s limit on watched folders (inotify) is reached; raise it on the hub computer.',
    tone: 'warning',
  },
};

export function watcherLineOf(state: DriveWatcherState): WatcherLine {
  return WATCHER_LINE[state];
}
