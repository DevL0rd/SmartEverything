import type { DesktopCaptureMode } from '@smarteverything/domain';
import { app } from 'electron';
import { currentCaptureMode, prepareScreenCapture } from './display-capture.js';

const LINUX_DISABLED_FEATURES: readonly string[] = ['Vulkan'];

export function prepareChromium(platform: NodeJS.Platform): DesktopCaptureMode {
  const mode = currentCaptureMode();
  prepareScreenCapture(mode);
  if (platform === 'linux') {
    app.commandLine.appendSwitch('disable-features', LINUX_DISABLED_FEATURES.join(','));
  }
  return mode;
}
