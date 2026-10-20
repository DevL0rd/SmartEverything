import type { ComputerControls } from '../../../src/node/controls/controls';

function refused(): Promise<never> {
  return Promise.reject(new Error('not used'));
}

function nothing(): () => void {
  return (): void => undefined;
}

function unusedSystem(): ComputerControls['system'] {
  return {
    settings: { state: refused, apply: refused },
    startup: { list: refused, set: refused },
    services: { list: refused, set: refused },
    processes: { detail: refused, prioritise: refused },
    files: {
      search: refused,
      properties: refused,
      write: refused,
      upload: refused,
      places: refused,
      openDownload: refused,
      readDownload: refused,
      closeDownload: refused,
    },
    features: refused,
  };
}

export function unusedControls(): Pick<
  ComputerControls,
  'audio' | 'displays' | 'windows' | 'tiling' | 'system' | 'machine' | 'input'
> {
  return {
    audio: { features: refused, read: refused, watch: nothing, change: refused },
    displays: {
      features: refused,
      read: refused,
      watch: nothing,
      change: refused,
      confirm: refused,
      stop: refused,
    },
    windows: { features: refused, read: refused, watch: nothing, change: refused },
    input: { features: () => Promise.resolve([]), send: refused },
    tiling: {
      features: () => Promise.resolve([]),
      read: refused,
      watch: nothing,
      change: refused,
      watchPresence: nothing,
      stop: () => Promise.resolve(),
    },
    machine: {
      report: () => Promise.resolve({ actions: [], permissions: [] }),
      watch: nothing,
      ring: refused,
      open: refused,
      unlock: refused,
      showUnlock: refused,
    },
    system: unusedSystem(),
  };
}

export function inertControls(): ComputerControls {
  return {
    ...unusedControls(),
    power: { available: () => Promise.resolve([]), run: refused },
    processes: {
      list: refused,
      signal: (): void => undefined,
      watch: (): void => undefined,
      read: () => null,
      stop: (): void => undefined,
    },
    links: () => [],
    session: {
      start: refused,
      stop: refused,
      setVolume: refused,
      setMuted: refused,
      playback: refused,
    },
    apps: { installed: refused, open: refused, close: refused },
    files: { list: refused, read: refused, range: refused },
    capture: { capture: refused },
  };
}
