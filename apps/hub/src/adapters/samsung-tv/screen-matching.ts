import { MAC_ADDRESS } from '@smarteverything/domain';
import { sameTvModel, type TvInfo } from '@smarteverything/smartthings';

export interface ScreenDevice {
  readonly id: string;
  readonly model: string;
  readonly online: boolean;
  readonly power: boolean | null;
  readonly macs: readonly string[];
}

export type ScreenMatch =
  | { readonly kind: 'known'; readonly deviceId: string; readonly mac: string }
  | { readonly kind: 'learned'; readonly deviceId: string; readonly mac: string }
  | { readonly kind: 'unsure'; readonly reason: string };

function macOf(info: TvInfo): string | null {
  const mac = info.wifiMac === null ? null : MAC_ADDRESS.safeParse(info.wifiMac);
  return mac?.success === true ? mac.data.toLowerCase() : null;
}

export function matchScreen(info: TvInfo, screens: readonly ScreenDevice[]): ScreenMatch {
  const mac = macOf(info);
  if (mac === null || info.model === null) {
    return { kind: 'unsure', reason: 'the screen did not report its MAC address and model' };
  }
  const known = screens.find((screen) =>
    screen.macs.some((address) => address.toLowerCase() === mac),
  );
  if (known !== undefined) {
    return { kind: 'known', deviceId: known.id, mac };
  }
  const model = info.model;
  const unlearned = screens.filter(
    (screen) => screen.macs.length === 0 && sameTvModel(screen.model, model),
  );
  if (unlearned.length === 0) {
    return { kind: 'unsure', reason: `no SmartThings screen without an address is a ${model}` };
  }
  const [only] = unlearned;
  return unlearned.length === 1 && only !== undefined
    ? { kind: 'learned', deviceId: only.id, mac }
    : byPower(info, model, mac, unlearned);
}

function byPower(
  info: TvInfo,
  model: string,
  mac: string,
  unlearned: readonly ScreenDevice[],
): ScreenMatch {
  if (!info.powerStateReported) {
    return { kind: 'unsure', reason: `${String(unlearned.length)} screens are a ${model}` };
  }
  const agreeing = unlearned.filter((screen) => screen.online && screen.power === info.on);
  const [agreed] = agreeing;
  return agreeing.length === 1 && agreed !== undefined
    ? { kind: 'learned', deviceId: agreed.id, mac }
    : {
        kind: 'unsure',
        reason: `${String(agreeing.length)} of ${String(unlearned.length)} ${model} screens are online with power ${info.on ? 'on' : 'off'}`,
      };
}
