import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import { answeringTelevisions } from './candidates';
import type { SamsungTvIo } from './io';
import type { HostSearch } from './lan-sweep';
import { matchScreen, type ScreenDevice } from './screen-matching';

export type FindOutcome = 'linked' | 'asking' | 'not_found';

export interface FindResult {
  readonly outcome: FindOutcome;
  readonly message: string;
}

export interface FindTelevisionOptions {
  readonly search: HostSearch;
  readonly io: SamsungTvIo;
  readonly screens: () => readonly ScreenDevice[];
  readonly isLinked: (deviceId: string) => boolean;
  readonly isLinking: () => boolean;
  readonly learn: (deviceId: string, mac: string) => void;
  readonly startLink: (host: string, deviceId: string) => void;
  readonly log: Logger;
}

const LINKED: FindResult = { outcome: 'linked', message: 'Linked' };
const ASKING: FindResult = { outcome: 'asking', message: 'Allow on the TV to finish linking' };
const NOTHING_ANSWERED: FindResult = {
  outcome: 'not_found',
  message: 'No Samsung screen answered. Turn the TV on and keep it on the same network as the hub.',
};
const OTHER_SCREEN_ANSWERED: FindResult = {
  outcome: 'not_found',
  message:
    'Only another screen answered. Turn this TV on, keep it on the same network as the hub and look again.',
};
const NOT_THIS_ONE: FindResult = {
  outcome: 'not_found',
  message:
    'A screen answered but it could not be matched to this TV. Use Link directly to pick it.',
};

export async function findTelevision(
  options: FindTelevisionOptions,
  deviceId: string,
): Promise<FindResult> {
  const { io, search, screens, isLinked, isLinking, learn, startLink, log } = options;
  if (isLinked(deviceId)) {
    return LINKED;
  }
  if (isLinking()) {
    return ASKING;
  }
  const answering = await answeringTelevisions(io, search, log);
  let elsewhere = false;
  for (const { host, info } of answering) {
    const match = matchScreen(info, screens());
    if (match.kind === 'unsure') {
      log.info('television.match_unsure', { host, model: info.model, reason: match.reason });
    } else if (match.deviceId !== deviceId) {
      elsewhere = true;
      log.info('television.answered_elsewhere', { deviceId, answeredFor: match.deviceId });
    } else {
      if (match.kind === 'learned') {
        learn(deviceId, match.mac);
        log.info('television.address_learned', { deviceId, model: info.model });
      }
      startLink(host, deviceId);
      return ASKING;
    }
  }
  if (answering.length === 0) {
    return NOTHING_ANSWERED;
  }
  return elsewhere ? OTHER_SCREEN_ANSWERED : NOT_THIS_ONE;
}

export function screensOf(
  store: Pick<Store, 'devices' | 'televisionSettings' | 'state'>,
): readonly ScreenDevice[] {
  return store.devices
    .list()
    .filter((device) => device.provider === 'smartthings' && device.kind === 'television')
    .map((device) => {
      const settings = store.televisionSettings.find(device.id);
      const power = store.state.value(device.id, 'power');
      return {
        id: device.id,
        model: device.model,
        online: device.online,
        power: typeof power === 'boolean' ? power : null,
        macs: [
          ...(settings?.wake_macs ?? []),
          ...(settings?.direct_mac === null || settings?.direct_mac === undefined
            ? []
            : [settings.direct_mac]),
        ],
      };
    });
}
