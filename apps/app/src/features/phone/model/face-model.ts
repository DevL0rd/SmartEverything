import {
  PHONE_FEATURE_SUPPORTS,
  phoneViewOf,
  type PhoneFeature,
  type PhoneFeatureSupport,
  type PhoneView,
  type Role,
} from '@smarteverything/domain';
import { clock } from '../../../format/time';
import { CONTEXT_TEXT } from '../phone-context-text';
import { phoneReadingsOf, type PhoneDoing, type PhoneReadings } from '../phone-values';
import type { DeviceValues } from '../../../store/state';

export type FaceTone = 'positive' | 'info' | 'warning' | 'critical' | 'neutral';

export interface FaceWord {
  readonly word: string;
  readonly tone: FaceTone;
  readonly detail: string | null;
}

type FeatureState = PhoneFeatureSupport['state'] | 'unknown';

export interface PhoneAccess {
  readonly view: PhoneView;
  readonly dnd: FeatureState;
  readonly torch: FeatureState;
  readonly fold: boolean;
}

export interface PhoneViewer {
  readonly profileId: string | null;
  readonly role: Role;
  readonly localDeviceId: string | null;
}

interface PhoneSubject {
  readonly id: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type FaceReadings = Pick<
  PhoneReadings,
  | 'battery'
  | 'charging'
  | 'chargeFullAt'
  | 'thermal'
  | 'temperature'
  | 'ringerMode'
  | 'dnd'
  | 'playback'
  | 'nowPlaying'
  | 'inCall'
  | 'ringing'
  | 'screenOn'
  | 'flashlight'
  | 'notificationCount'
  | 'doing'
  | 'networkKind'
  | 'signalBars'
  | 'screenMinutes'
  | 'reportedAt'
> & { readonly mediaVolume: number | null };

export function faceReadingsOf(values: DeviceValues, online: boolean): FaceReadings {
  const readings = phoneReadingsOf(values);
  return {
    battery: readings.battery,
    charging: readings.charging,
    chargeFullAt: readings.chargeFullAt,
    thermal: readings.thermal,
    temperature: readings.temperature,
    ringerMode: readings.ringerMode,
    dnd: readings.dnd,
    playback: readings.playback,
    nowPlaying: readings.nowPlaying,
    inCall: readings.inCall,
    ringing: readings.ringing,
    screenOn: readings.screenOn,
    flashlight: readings.flashlight,
    notificationCount: readings.notificationCount,
    doing: readings.doing,
    networkKind: readings.networkKind,
    signalBars: readings.signalBars,
    screenMinutes: readings.screenMinutes,
    reportedAt: online ? null : readings.reportedAt,
    mediaVolume: readings.volumes.media,
  };
}

const LOW_LEVEL = 20;
const HOT_STATES: ReadonlySet<string> = new Set(['moderate', 'severe', 'critical']);

export function featuresOf(details: PhoneSubject['details']): readonly PhoneFeatureSupport[] {
  const parsed = PHONE_FEATURE_SUPPORTS.safeParse(details['phoneFeatures']);
  return parsed.success ? parsed.data : [];
}

export function featureState(
  features: readonly PhoneFeatureSupport[],
  feature: PhoneFeature,
): FeatureState {
  return features.find((support) => support.feature === feature)?.state ?? 'unknown';
}

export function accessOf(phone: PhoneSubject, viewer: PhoneViewer): PhoneAccess {
  const profile = phone.details['profileId'];
  const features = featuresOf(phone.details);
  return {
    view: phoneViewOf({
      phoneProfileId: typeof profile === 'string' ? profile : '',
      phoneDeviceId: phone.id,
      viewerProfileId: viewer.profileId ?? '',
      viewerRole: viewer.role,
      localDeviceId: viewer.localDeviceId,
    }),
    dnd: featureState(features, 'dnd'),
    torch: featureState(features, 'torch'),
    fold: featureState(features, 'fold') === 'ready',
  };
}

export function isLow(readings: Pick<FaceReadings, 'battery'>): boolean {
  return readings.battery !== null && readings.battery <= LOW_LEVEL;
}

function isHot(readings: Pick<FaceReadings, 'thermal'>): boolean {
  return readings.thermal !== null && HOT_STATES.has(readings.thermal);
}

function offlineWord(readings: FaceReadings): FaceWord {
  const last = readings.reportedAt === null ? null : `Last report ${clock(readings.reportedAt)}`;
  return {
    word: last ?? 'Phone is offline',
    tone: 'neutral',
    detail: 'Phone is offline · commands wait until it is back',
  };
}

function chargingWord(readings: FaceReadings): FaceWord {
  const full = readings.chargeFullAt === null ? null : `Full at ~${clock(readings.chargeFullAt)}`;
  return { word: 'Charging', tone: 'positive', detail: full };
}

function hotWord(readings: FaceReadings): FaceWord {
  const celsius =
    readings.temperature === null ? null : `${String(Math.round(readings.temperature))} °C`;
  return { word: 'Hot', tone: 'warning', detail: celsius };
}

export function faceWordOf(readings: FaceReadings, online: boolean): FaceWord {
  if (!online) return offlineWord(readings);
  if (readings.ringing === true) return { word: 'Ringing…', tone: 'info', detail: null };
  if (readings.inCall === true) return { word: 'In a call', tone: 'info', detail: null };
  if (isLow(readings)) return { word: 'Battery low', tone: 'warning', detail: null };
  if (isHot(readings)) return hotWord(readings);
  if (readings.charging) return chargingWord(readings);
  if (readings.screenOn === false) return { word: 'Screen off', tone: 'info', detail: null };
  return { word: 'On battery', tone: 'info', detail: null };
}

export function doingWordOf(doing: PhoneDoing | null, online: boolean): string | null {
  if (!online) return 'Offline';
  return doing === null ? null : CONTEXT_TEXT[doing.state];
}

export function doingSince(doing: PhoneDoing | null): string | null {
  return doing === null ? null : `${CONTEXT_TEXT[doing.state]} since ${clock(doing.at)}`;
}

export function spokenPhone(readings: FaceReadings, online: boolean): string {
  const parts = ['Phone'];
  if (readings.battery !== null) parts.push(`${String(readings.battery)} percent`);
  if (!online) return [...parts, 'offline'].join(', ');
  if (readings.charging) parts.push('charging');
  if (readings.ringing === true) parts.push('ringing');
  if (readings.ringerMode !== null) parts.push(`ringer ${readings.ringerMode}`);
  return parts.join(', ');
}
