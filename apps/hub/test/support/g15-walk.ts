import { FTMS_TREADMILL_DATA, SUPPLEMENT_NOTIFY, bytesToHex } from '@smarteverything/ble';
import {
  settingsOf,
  type DeviceRow,
  type InclineScale,
  type TreadmillGattDump,
} from '@smarteverything/domain';
import { treadmillRig, type TreadmillRig } from './treadmill-rig';

export const G15_GATT: TreadmillGattDump = {
  name: 'KS-SO-G15',
  services: [
    {
      uuid: '1826',
      characteristics: [
        { uuid: '2acc', properties: ['read'], value: '4816000044020000' },
        { uuid: '2ad4', properties: ['read'], value: '6400dc050a00' },
        { uuid: '2ad5', properties: ['read'], value: '0000c8000a00' },
      ],
    },
  ],
};

const START_MS = Date.parse('2026-10-18T10:00:00.000Z');

const FLAGS = 0b0000_0101_1000_1100;

export interface BeltSecond {
  readonly second: number;
  readonly kmh: number;
  readonly incline: number;
  readonly beltKcal?: number;
  readonly heartRate?: number;
}

export function treadmillDataHex(fields: BeltSecond): string {
  const speed = Math.round(fields.kmh * 100);
  const incline = Math.round(fields.incline * 10);
  const kcal = fields.beltKcal ?? 0;
  const bytes = [
    FLAGS & 0xff,
    FLAGS >> 8,
    speed & 0xff,
    speed >> 8,
    fields.second & 0xff,
    (fields.second >> 8) & 0xff,
    0,
    incline & 0xff,
    (incline >> 8) & 0xff,
    0,
    0,
    kcal & 0xff,
    kcal >> 8,
    0,
    0,
    0,
    fields.heartRate ?? 0,
    fields.second & 0xff,
    fields.second >> 8,
  ];
  return bytesToHex(Uint8Array.from(bytes));
}

export function g15Rig(): Promise<TreadmillRig> {
  return treadmillRig('ftms_supplement', G15_GATT);
}

export function feed(
  rig: TreadmillRig,
  second: number,
  frames: readonly { readonly characteristic: string; readonly hex: string }[],
  phase: 'linked' | 'lost' = 'linked',
): void {
  const at = new Date(START_MS + second * 1000).toISOString();
  rig.clock.advanceTo(at);
  rig.ingest.process(rig.test.store.devices.byId(rig.row().id), rig.owner.client, {
    frames: frames.map((frame) => ({ at, ...frame })),
    link: { phase, rssi: -55, reconnects: 0, detail: null },
  });
}

export function walkFrame(fields: BeltSecond): { characteristic: string; hex: string } {
  return { characteristic: FTMS_TREADMILL_DATA, hex: treadmillDataHex(fields) };
}

export function sleepFrame(sleeping: boolean): { characteristic: string; hex: string } {
  const value = sleeping ? 0b0100_0000 : 0;
  const body = [0x72, 0x50, 4, 10, 0, value & 0xff, value >> 8];
  const sum = body.reduce((total, byte) => total + byte, 0) & 0xff;
  return { characteristic: SUPPLEMENT_NOTIFY, hex: bytesToHex(Uint8Array.from([...body, sum])) };
}

export function walk(
  rig: TreadmillRig,
  seconds: number,
  per: Omit<BeltSecond, 'second'>,
  from = 1,
): void {
  for (let second = from; second < from + seconds; second += 1) {
    feed(rig, second, [walkFrame({ ...per, second })]);
  }
}

export function stopBelt(rig: TreadmillRig, second: number, elapsed: number): void {
  feed(rig, second, [walkFrame({ second: elapsed, kmh: 0, incline: 0 })]);
}

export function setScale(rig: TreadmillRig, scale: InclineScale): DeviceRow {
  const device = rig.row();
  const { store } = rig.test;
  const state = rig.fleet.of(device);
  const { entry } = state;
  store.localDevices.updateConfig(entry.externalId, {
    ...entry.config,
    settings: { ...settingsOf(entry.config['settings']), inclineScale: scale },
  });
  state.useEntry(store.localDevices.byExternalId(entry.externalId));
  return device;
}
