import path from 'node:path';
import type { DesktopTalkTray } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { nativeImage, nativeTheme, Tray, type NativeImage } from 'electron';
import { talkTrayImages, type TalkTrayImages } from './talk/talk-tray.js';

type Activity = DesktopTalkTray['activity'];

export type TrayTone = 'white' | 'black';

type ThemeColours = Pick<
  typeof nativeTheme,
  'shouldUseDarkColors' | 'shouldUseDarkColorsForSystemIntegratedUI'
>;

const MAC_TEMPLATE_FILE = 'trayTemplate.png';

const log = new Logger('desktop.tray');

export function trayTone(platform: NodeJS.Platform, theme: ThemeColours): TrayTone {
  const dark =
    platform === 'win32'
      ? theme.shouldUseDarkColorsForSystemIntegratedUI
      : theme.shouldUseDarkColors;
  return dark ? 'white' : 'black';
}

export function trayToneFile(platform: NodeJS.Platform, tone: TrayTone): string {
  return platform === 'win32' ? `tray-${tone}.ico` : `tray-${tone}.png`;
}

function loaded(directory: string, file: string): NativeImage {
  const image = nativeImage.createFromPath(path.join(directory, file));
  if (image.isEmpty()) {
    throw new Error(`The tray icon ${file} is missing or unreadable in ${directory}.`);
  }
  return image;
}

export function trayImages(directory: string, platform: NodeJS.Platform): TalkTrayImages {
  const tone = trayTone(platform, nativeTheme);
  const images = talkTrayImages(loaded(directory, trayToneFile(platform, tone)));
  log.debug('tray.icon_tone', { tone, platform });
  return platform === 'darwin' ? { ...images, idle: loaded(directory, MAC_TEMPLATE_FILE) } : images;
}

export interface ThemedTray {
  readonly tray: Tray;
  readonly show: (activity: Activity) => void;
  readonly stop: () => void;
}

export function themedTray(directory: string, platform: NodeJS.Platform): ThemedTray {
  let images = trayImages(directory, platform);
  let activity: Activity = 'idle';
  const tray = new Tray(images.idle);
  const follow = (): void => {
    images = trayImages(directory, platform);
    tray.setImage(images[activity]);
  };
  nativeTheme.on('updated', follow);
  return {
    tray,
    show: (next): void => {
      activity = next;
      tray.setImage(images[activity]);
    },
    stop: (): void => {
      nativeTheme.removeListener('updated', follow);
    },
  };
}
