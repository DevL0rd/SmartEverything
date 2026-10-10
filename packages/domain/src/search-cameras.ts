import { DEVICE_KIND_LABELS } from './device-kinds';
import type { SearchCamera, SearchEntry, SearchSources, SearchTarget } from './search';

const SHOW_WORDS: readonly string[] = ['camera', 'live', 'view', 'watch', 'see', 'open', 'video'];

const TALK_WORDS: readonly string[] = ['camera', 'speak', 'intercom', 'microphone', 'answer'];

function detailOf(camera: SearchCamera): string {
  return camera.room === null ? 'Live view' : `${camera.room} · Live view`;
}

function wordsOf(camera: SearchCamera, words: readonly string[]): string[] {
  return [...words, DEVICE_KIND_LABELS[camera.kind], camera.room ?? ''].filter(
    (word) => word !== '',
  );
}

function cameraEntry(camera: SearchCamera, talk: boolean): SearchEntry {
  const target: SearchTarget = { kind: 'camera', deviceId: camera.id, talk };
  return {
    id: `camera:${camera.id}:${talk ? 'talk' : 'show'}`,
    group: 'action',
    title: talk ? `Talk to ${camera.name}` : `Show ${camera.name}`,
    detail: detailOf(camera),
    keywords: wordsOf(camera, talk ? TALK_WORDS : SHOW_WORDS),
    state: camera.online ? null : 'Offline',
    run: target,
    runLabel: talk ? 'Talk' : 'Show',
    open: target,
    openLabel: 'Open',
    suggested: false,
  };
}

export function cameraEntries(sources: SearchSources): SearchEntry[] {
  return sources.cameras.flatMap((camera) => [
    cameraEntry(camera, false),
    ...(camera.twoWayAudio ? [cameraEntry(camera, true)] : []),
  ]);
}
