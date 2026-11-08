import { joinParts, plural } from '../../../format/text';

export const BAND_INSET = 26;

export interface RoomLive {
  readonly devices: number;
  readonly on: number;
  readonly offline: number;
  readonly lightsOn: number;
}

function powerLine(live: RoomLive): string {
  return live.on === 0 ? 'All off' : `${String(live.on)} of ${String(live.devices)} on`;
}

export function roomStatusLine(live: RoomLive): string {
  return joinParts([powerLine(live), live.offline > 0 && `${String(live.offline)} offline`]);
}

export function selectedRoomStatusLine(live: RoomLive, shown: number): string {
  return joinParts([
    shown !== live.devices && `${plural(shown, 'device')} shown`,
    roomStatusLine(live),
    live.lightsOn > 0 && `${plural(live.lightsOn, 'light')} on`,
  ]);
}
