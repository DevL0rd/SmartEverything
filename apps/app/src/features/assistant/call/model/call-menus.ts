import type { MenuItem } from '../../../../components/menu-rows';
import type { AppPlatform } from '../../../../design/platform';
import type { CallView } from '../call-state';
import type { EngineCapabilities } from '../engine/call-engine';
import { sharingOf } from './call-controls';

export interface CameraMenuHandlers {
  readonly onFacing: (facing: 'front' | 'back') => void;
  readonly onPause: (paused: boolean) => void;
  readonly onLight: (on: boolean) => void;
  readonly onHome: () => void;
  readonly onStop: () => void;
}

export function cameraMenuOf(
  call: CallView,
  caps: EngineCapabilities,
  handlers: CameraMenuHandlers,
): readonly MenuItem[] {
  const { facing, camera, light } = call.video;
  const paused = camera === 'paused';
  const phone = facing !== 'external';
  const items: MenuItem[] = [];
  if (phone) {
    items.push(
      {
        label: 'Front camera',
        icon: facing === 'front' ? 'check' : 'smartphone',
        onPress: () => {
          handlers.onFacing('front');
        },
      },
      {
        label: 'Back camera',
        icon: facing === 'back' ? 'check' : 'camera',
        onPress: () => {
          handlers.onFacing('back');
        },
      },
    );
  }
  items.push({
    label: paused ? 'Resume video' : 'Pause video',
    icon: paused ? 'play' : 'pause',
    onPress: () => {
      handlers.onPause(!paused);
    },
  });
  if (phone && facing === 'back' && caps.light === null) {
    items.push({
      label: light ? 'Light off' : 'Light on',
      icon: 'flashlight',
      onPress: () => {
        handlers.onLight(!light);
      },
    });
  }
  items.push(
    { label: 'Show a home camera…', icon: 'house', onPress: handlers.onHome },
    { label: 'Turn camera off', icon: 'cameraOff', destructive: true, onPress: handlers.onStop },
  );
  return items;
}

export interface ShareMenuHandlers {
  readonly onScreen: () => void;
  readonly onWindow: () => void;
  readonly onHome: () => void;
  readonly onStop: () => void;
}

export function shareMenuOf(
  call: CallView,
  platform: AppPlatform,
  windows: boolean,
  handlers: ShareMenuHandlers,
): readonly MenuItem[] {
  const items: MenuItem[] = [
    {
      label: sharingOf(call) ? 'Share a different screen' : 'Share screen',
      icon: 'screenShare',
      onPress: handlers.onScreen,
    },
  ];
  if (platform !== 'android' && windows) {
    items.push({ label: 'Share a window', icon: 'appWindow', onPress: handlers.onWindow });
  }
  items.push({ label: 'Show a home camera…', icon: 'house', onPress: handlers.onHome });
  if (sharingOf(call)) {
    items.push({
      label: 'Stop sharing',
      icon: 'square',
      destructive: true,
      onPress: handlers.onStop,
    });
  }
  return items;
}
