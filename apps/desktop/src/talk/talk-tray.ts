import type { DesktopTalkCommand, DesktopTalkTray } from '@smarteverything/domain';
import { nativeImage, type MenuItemConstructorOptions, type NativeImage } from 'electron';

type Activity = DesktopTalkTray['activity'];

const DOT: Readonly<Record<Exclude<Activity, 'idle'>, readonly [number, number, number]>> = {
  talking: [229, 72, 77],
  receiving: [74, 144, 226],
};

function withDot(image: NativeImage, colour: readonly [number, number, number]): NativeImage {
  const { width, height } = image.getSize();
  const bitmap = Buffer.from(image.toBitmap());
  const radius = Math.max(3, Math.round(width / 4));
  const centreX = width - radius;
  const centreY = height - radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((x - centreX) ** 2 + (y - centreY) ** 2 <= radius ** 2) {
        const at = (y * width + x) * 4;
        bitmap.writeUInt8(colour[2], at);
        bitmap.writeUInt8(colour[1], at + 1);
        bitmap.writeUInt8(colour[0], at + 2);
        bitmap.writeUInt8(255, at + 3);
      }
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width, height });
}

export interface TalkTrayImages {
  readonly idle: NativeImage;
  readonly talking: NativeImage;
  readonly receiving: NativeImage;
}

export function talkTrayImages(base: NativeImage): TalkTrayImages {
  return {
    idle: base,
    talking: withDot(base, DOT.talking),
    receiving: withDot(base, DOT.receiving),
  };
}

export function talkMenuItems(
  state: DesktopTalkTray | null,
  send: (command: DesktopTalkCommand) => void,
): MenuItemConstructorOptions[] {
  if (state === null) {
    return [];
  }
  const talking = state.activity === 'talking';
  return [
    { label: `Walkie-talkie: ${state.status}`, enabled: false },
    {
      label: talking ? 'Stop talking' : 'Talk',
      enabled: state.talkChannel !== null,
      click: (): void => {
        send({ kind: 'toggle' });
      },
    },
    ...state.channels.map((channel): MenuItemConstructorOptions => ({
      label: channel.name,
      type: 'radio',
      checked: channel.id === state.talkChannel,
      click: (): void => {
        send({ kind: 'select', channelId: channel.id });
      },
    })),
    {
      label: 'Open walkie-talkie',
      click: (): void => {
        send({ kind: 'open' });
      },
    },
    { type: 'separator' },
  ];
}
