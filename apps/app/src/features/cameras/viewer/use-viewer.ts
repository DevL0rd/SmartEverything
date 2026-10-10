import { useState } from 'react';
import type { ComposedGesture } from 'react-native-gesture-handler';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { useMotion } from '../../../design/motion';
import { useLedger } from '../../../store/store-context';
import { useCameraEntries } from '../data/use-cameras';
import { neighbourOf, presetsOf, type CameraEntry } from '../logic/cameras';
import { useAutoHide, type AutoHide } from '../player/use-auto-hide';
import { useScreenSession, type LiveSession } from '../player/use-live-session';
import { usePlayerGestures } from '../player/use-player-gestures';
import { useCameraZoom, type CameraZoom } from '../player/use-camera-zoom';
import { usePtz, type Ptz, type PtzDirection } from '../player/use-ptz';
import { useZoom, type Zoom } from '../player/use-zoom';
import { useFullScreen, type FullScreen } from './use-full-screen';

export interface Viewer {
  readonly entry: CameraEntry;
  readonly live: LiveSession;
  readonly zoom: Zoom;
  readonly camera: CameraZoom;
  readonly ptz: Ptz;
  readonly hide: AutoHide;
  readonly gesture: ComposedGesture;
  readonly fullScreen: FullScreen;
  readonly info: boolean;
  readonly setInfo: (open: boolean) => void;
  readonly quick: boolean;
  readonly setQuick: (open: boolean) => void;
  readonly switchCamera: ((step: 1 | -1) => void) | null;
}

const WHEEL_PIXELS_PER_X = 300;

const ARROWS: Readonly<Record<string, PtzDirection>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

function useSwitcher(entry: CameraEntry): ((step: 1 | -1) => void) | null {
  const router = useRouter();
  const entries = useCameraEntries();
  if (entries.length < 2) {
    return null;
  }
  return (step): void => {
    const next = neighbourOf(entries, entry.device.id, step);
    if (next !== null) {
      router.replace(href.camera(next.device.id));
    }
  };
}

function useViewerKeys(viewer: Omit<Viewer, 'gesture'>): void {
  const focused = useIsFocused();
  const ledger = useLedger();
  const presets = presetsOf(viewer.entry);
  useKeyboard((press: KeyPress): boolean => {
    if (!focused || press.typing || press.command || press.alt) {
      return false;
    }
    const direction = ARROWS[press.key];
    if (direction !== undefined) {
      viewer.ptz.step(direction);
      return true;
    }
    const preset = /^[1-9]$/.test(press.key) ? presets[Number(press.key) - 1] : undefined;
    if (preset !== undefined) {
      void ledger.send(viewer.entry.device, 'ptz_preset', preset);
      return true;
    }
    const { session } = viewer.live;
    const actions: Readonly<Record<string, () => void>> = {
      f: viewer.fullScreen.toggle,
      m: () => {
        session.setListening(!session.listening);
      },
    };
    const action = actions[press.key.toLowerCase()];
    action?.();
    return action !== undefined;
  });
}

export function useViewer(entry: CameraEntry, answering: boolean): Viewer {
  const live = useScreenSession(entry, { enabled: true, answering });
  const zoom = useZoom(useMotion().reduced);
  const ptz = usePtz(entry.device, entry.camera?.physical_ptz === true);
  const hide = useAutoHide(live.state.kind === 'live');
  const fullScreen = useFullScreen(useLocalSearchParams<{ full?: string }>().full === '1');
  const [info, setInfo] = useState(false);
  const [quick, setQuick] = useState(false);
  const switcher = useSwitcher(entry);
  const switchCamera = fullScreen.immersive ? switcher : null;
  const camera = useCameraZoom(entry.device);
  const stageZoom: Zoom = camera.supported
    ? {
        ...zoom,
        wheel: (deltaY): void => {
          camera.commit(camera.level - deltaY / WHEEL_PIXELS_PER_X);
        },
      }
    : zoom;
  const gesture = usePlayerGestures({
    zoom,
    camera,
    onTap: hide.toggle,
    ptz: ptz.supported ? ptz.hold : null,
    onSwipe: switchCamera,
  });
  const viewer = {
    entry,
    camera,
    live,
    zoom: stageZoom,
    ptz,
    hide,
    fullScreen,
    info,
    setInfo,
    quick,
    setQuick,
    switchCamera,
  };
  useViewerKeys(viewer);
  return { ...viewer, gesture };
}
