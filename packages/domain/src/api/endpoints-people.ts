import { z } from 'zod';
import {
  BLE_ADVERT_BATCH,
  BLE_RELAY_RESULT,
  BLE_WATCH,
  BODY_READING_ROW,
  HEALTH_OUTBOX,
  HEALTH_OUTBOX_ACK,
} from '../body-readings';
import { NEW_PROFILE, PROFILE_CHANGE, PROFILE_ROW } from '../profiles';
import { SEALED } from '../sealed';
import { NO_BODY, endpoint } from './endpoint';
import { SESSION } from './endpoints-access';
import { DONE, ID, NOTHING } from './primitives';
import { DEVICE_NAME, DEVICE_ROW } from './rows-home';

export const LOCAL_DRIVERS = ['xiaomi_scale', 'xiaomi_watch', 'xiaomi_magnet'] as const;

export type LocalDriver = (typeof LOCAL_DRIVERS)[number];

export const BLUETOOTH_ADDRESS = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/, 'a Bluetooth address such as D0:7B:6F:A6:AB:45');

export const BIND_KEY = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{32}$/, '32 hexadecimal characters');

export const LOCAL_DEVICE_SETUP = z.union([
  z.strictObject({
    driver: z.literal('xiaomi_magnet'),
    source: z.literal('xiaomi'),
    xiaomiDeviceId: ID,
  }),
  z.strictObject({
    driver: z.literal('xiaomi_scale'),
    source: z.literal('xiaomi'),
    xiaomiDeviceId: ID,
  }),
  z.strictObject({
    driver: z.literal('xiaomi_scale'),
    source: z.literal('manual'),
    name: DEVICE_NAME,
    address: BLUETOOTH_ADDRESS,
    bindKey: SEALED,
  }),
  z.strictObject({
    driver: z.literal('xiaomi_watch'),
    source: z.literal('xiaomi'),
    address: BLUETOOTH_ADDRESS,
    profileId: ID,
  }),
]);

export type LocalDeviceSetup = z.infer<typeof LOCAL_DEVICE_SETUP>;

const PROFILE_ENDPOINTS = {
  createProfile: endpoint({
    method: 'POST',
    path: '/api/profiles',
    access: 'owner',
    summary: 'Add a person to the home',
    params: NOTHING,
    query: NOTHING,
    body: NEW_PROFILE,
    response: PROFILE_ROW,
  }),
  updateProfile: endpoint({
    method: 'PATCH',
    path: '/api/profiles/:profileId',
    access: 'member',
    summary: 'Change a person; members may change only the profile their app uses',
    params: z.strictObject({ profileId: ID }),
    query: NOTHING,
    body: PROFILE_CHANGE,
    response: PROFILE_ROW,
  }),
  deleteProfile: endpoint({
    method: 'DELETE',
    path: '/api/profiles/:profileId',
    access: 'owner',
    summary: 'Remove a person with their health data; their apps move to the first profile',
    params: z.strictObject({ profileId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  selectProfile: endpoint({
    method: 'PUT',
    path: '/api/session/profile',
    access: 'member',
    summary: 'Choose whose preferences and health data this app shows',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ profileId: ID }),
    response: SESSION,
  }),
  assignBodyReading: endpoint({
    method: 'POST',
    path: '/api/body-readings/:readingId/assign',
    access: 'member',
    summary: 'Say who stood on the scale; null discards the reading',
    params: z.strictObject({ readingId: ID }),
    query: NOTHING,
    body: z.strictObject({ profileId: ID.nullable() }),
    response: BODY_READING_ROW,
  }),
} as const;

const LOCAL_DEVICE_ENDPOINTS = {
  addLocalDevice: endpoint({
    method: 'POST',
    path: '/api/local-devices',
    access: 'owner',
    summary: 'Add a built-in device or enable passive Bluetooth updates on an existing Xiaomi door',
    params: NOTHING,
    query: NOTHING,
    body: LOCAL_DEVICE_SETUP,
    response: DEVICE_ROW,
  }),
  removeLocalDevice: endpoint({
    method: 'DELETE',
    path: '/api/local-devices/:deviceId',
    access: 'owner',
    summary: 'Remove a built-in device or disable an existing device’s passive Bluetooth updates',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  removeBleObserver: endpoint({
    method: 'DELETE',
    path: '/api/ble/devices/:deviceId',
    access: 'owner',
    summary:
      'Disable passive Bluetooth observation and forget its key; preserve the original Xiaomi device',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  readBleDevice: endpoint({
    method: 'GET',
    path: '/api/ble/devices/:deviceId',
    access: 'member',
    summary:
      'Read passive Bluetooth setup and authenticated receiver freshness for an existing device',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: z.strictObject({
      configured: z.boolean(),
      address: BLUETOOTH_ADDRESS.nullable(),
      lastSeenAt: z.string().nullable(),
      freshUntil: z.string().nullable(),
      blockedReason: z.string().nullable(),
    }),
  }),
  readBleWatch: endpoint({
    method: 'GET',
    path: '/api/ble/watch',
    access: 'member',
    summary: 'The Bluetooth adverts a phone should listen for and forward',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: BLE_WATCH,
  }),
  relayBleAdverts: endpoint({
    method: 'POST',
    path: '/api/ble/adverts',
    access: 'member',
    summary: 'Adverts a phone heard; the hub decodes, de-duplicates and attributes them',
    params: NOTHING,
    query: NOTHING,
    body: BLE_ADVERT_BATCH,
    response: BLE_RELAY_RESULT,
  }),
  readHealthOutbox: endpoint({
    method: 'GET',
    path: '/api/health/outbox',
    access: 'health_source',
    summary: 'Scale readings of this phone’s person not yet saved to its Health Connect',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: HEALTH_OUTBOX,
  }),
  ackHealthOutbox: endpoint({
    method: 'POST',
    path: '/api/health/outbox',
    access: 'health_source',
    summary: 'Readings this phone saved to Health Connect, with the version it saved',
    params: NOTHING,
    query: NOTHING,
    body: HEALTH_OUTBOX_ACK,
    response: DONE,
  }),
} as const;

export const PEOPLE_AREA_ENDPOINTS = { ...PROFILE_ENDPOINTS, ...LOCAL_DEVICE_ENDPOINTS } as const;
