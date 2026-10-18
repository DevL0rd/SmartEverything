import type { FilePlaces } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type {
  AudioControl,
  DisplayControl,
  SessionControl,
  WindowControl,
} from '../session-controls';
import type { FileWriteControl, SystemControls } from '../system-controls';

export type MachineName = 'Windows' | 'macOS';

export function notSupported(what: string, machine: MachineName): Promise<never> {
  return Promise.reject(
    new NodeFailureError('not_supported', `${what} is not available on ${machine} yet.`),
  );
}

const NO_FEATURES = (): Promise<readonly never[]> => Promise.resolve([]);

const NO_WATCH = (): (() => void) => () => undefined;

export function unsupportedAudio(machine: MachineName): AudioControl {
  return {
    features: NO_FEATURES,
    read: () => notSupported('Sound control', machine),
    watch: NO_WATCH,
    change: () => notSupported('Sound control', machine),
  };
}

export function unsupportedDisplays(machine: MachineName): DisplayControl {
  return {
    features: NO_FEATURES,
    read: () => notSupported('Display control', machine),
    watch: NO_WATCH,
    change: () => notSupported('Display control', machine),
    confirm: () => notSupported('Display control', machine),
    stop: () => Promise.resolve(),
  };
}

export function unsupportedWindows(machine: MachineName): WindowControl {
  return {
    features: NO_FEATURES,
    read: () => notSupported('Window control', machine),
    watch: NO_WATCH,
    change: () => notSupported('Window control', machine),
  };
}

export function unsupportedSession(machine: MachineName): SessionControl {
  return {
    start: () =>
      Promise.reject(
        new NodeFailureError(
          'no_session',
          `The signed-in session is not watched on ${machine} yet.`,
        ),
      ),
    stop: () => Promise.resolve(),
    setVolume: () => notSupported('Volume control', machine),
    setMuted: () => notSupported('Volume control', machine),
    playback: () => notSupported('Media control', machine),
  };
}

export function unsupportedSystem(
  machine: MachineName,
  places: () => Promise<FilePlaces>,
): SystemControls {
  const no = (what: string) => (): Promise<never> => notSupported(what, machine);
  const files: FileWriteControl = {
    search: no('File search'),
    properties: no('File details'),
    write: no('Changing files'),
    upload: no('Sending files to the computer'),
    places,
    openDownload: no('Downloading files'),
    readDownload: no('Downloading files'),
    closeDownload: () => Promise.resolve(),
  };
  return {
    settings: {
      state: () =>
        Promise.resolve({
          battery: null,
          powerMode: null,
          dnd: null,
          keyboard: null,
          wifi: null,
          bluetooth: null,
          usb: [],
        }),
      apply: no('System settings'),
    },
    startup: { list: () => Promise.resolve({ entries: [] }), set: no('Startup apps') },
    services: {
      list: () => Promise.resolve({ services: [], timers: [] }),
      set: no('Services'),
    },
    processes: { detail: no('Program details'), prioritise: no('Program priority') },
    files,
    features: NO_FEATURES,
  };
}
