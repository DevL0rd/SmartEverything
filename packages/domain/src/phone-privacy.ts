import type { Role } from './api/primitives';
import type { PhoneAction, PhoneValues } from './phones';
import type { EventRow } from './api/rows-home';
import { PHONE_DETAIL, type PhoneDetail } from './phone-detail';

export const PHONE_TIERS = ['person', 'owner', 'member'] as const;

export type PhoneTier = (typeof PHONE_TIERS)[number];

export interface PhoneViewerInput {
  readonly phoneProfileId: string;
  readonly phoneDeviceId: string;
  readonly viewerProfileId: string | null;
  readonly viewerRole: Role;
  readonly localDeviceId: string | null;
}

export interface PhoneView {
  readonly tier: PhoneTier;
  readonly own: boolean;
  readonly here: boolean;
  readonly canAct: boolean;
  readonly canRing: boolean;
  readonly canOpenLink: boolean;
}

export function phoneTierOf(
  input: Pick<PhoneViewerInput, 'phoneProfileId' | 'viewerProfileId' | 'viewerRole'>,
): PhoneTier {
  if (input.phoneProfileId === input.viewerProfileId) return 'person';
  return input.viewerRole === 'owner' ? 'owner' : 'member';
}

export function phoneViewOf(input: PhoneViewerInput): PhoneView {
  const tier = phoneTierOf(input);
  const own = tier === 'person';
  const here = input.localDeviceId !== null && input.localDeviceId === input.phoneDeviceId;
  const canAct = tier !== 'member';
  return { tier, own, here, canAct, canRing: canAct && !here, canOpenLink: own && !here };
}

export type PhoneActionType = PhoneAction['type'];

const PERSON_ONLY_ACTIONS: ReadonlySet<PhoneActionType> = new Set([
  'dismiss_notification',
  'launch_app',
  'screenshot',
]);

export function phoneActionPersonOnly(type: PhoneActionType): boolean {
  return PERSON_ONLY_ACTIONS.has(type);
}

export function phoneActionAllowed(
  action: { readonly type: PhoneActionType },
  tier: PhoneTier,
): boolean {
  if (phoneActionPersonOnly(action.type)) return tier === 'person';
  return tier !== 'member';
}

const PLACE_EVENTS: ReadonlySet<string> = new Set(['place_arrived', 'place_left']);

const CONTEXT_EVENTS: ReadonlySet<string> = new Set(['phone_context_changed', 'parked']);

export function phoneEventFor(event: EventRow, tier: PhoneTier): EventRow | null {
  if (tier === 'person') return event;
  if (PLACE_EVENTS.has(event.kind)) return null;
  if (!CONTEXT_EVENTS.has(event.kind)) return event;
  return tier === 'member' ? null : { ...event, details: { ...event.details, place: null } };
}

const OWNER_HIDDEN_VALUES = [
  'place',
  'now_playing',
] as const satisfies readonly (keyof PhoneValues)[];

const MEMBER_HIDDEN_VALUES = [
  ...OWNER_HIDDEN_VALUES,
  'screen_time_today',
  'notification_count',
  'storage_free',
  'phone_context',
  'context_confidence',
] as const satisfies readonly (keyof PhoneValues)[];

const HIDDEN_VALUES: Readonly<Record<PhoneTier, readonly (keyof PhoneValues)[]>> = {
  person: [],
  owner: OWNER_HIDDEN_VALUES,
  member: MEMBER_HIDDEN_VALUES,
};

export function phoneValueHidden(key: string, tier: PhoneTier): boolean {
  return HIDDEN_VALUES[tier].some((name) => name === key);
}

export function phoneValuesFor(values: PhoneValues, tier: PhoneTier): PhoneValues {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !phoneValueHidden(key, tier)));
}

type Sections = PhoneDetail;

function ownerSound<T extends NonNullable<Sections['sound']>>(section: T): T {
  return {
    ...section,
    output: { ...section.output, name: null },
    media:
      section.media === null
        ? null
        : { ...section.media, title: null, artist: null, app: null, appLabel: null },
  };
}

function ownerNetwork<T extends NonNullable<Sections['network']>>(
  section: T,
  hideData: boolean,
): T {
  return {
    ...section,
    wifi: section.wifi === null ? null : { ...section.wifi, ssid: null },
    data: hideData ? null : section.data,
  };
}

function ownerConnections<T extends NonNullable<Sections['connections']>>(section: T): T {
  return { ...section, bluetooth: section.bluetooth.map((device) => ({ ...device, name: null })) };
}

function ownerStorage<T extends NonNullable<Sections['storage']>>(section: T): T {
  return { ...section, apps: [] };
}

function ownerApps<T extends NonNullable<Sections['apps']>>(section: T): T {
  return { ...section, installed: [], usage: [], front: null };
}

function ownerNotifications<T extends NonNullable<Sections['notifications']>>(section: T): T {
  return { ...section, apps: [], items: null };
}

function memberScreen<T extends NonNullable<Sections['screen']>>(section: T): T {
  return { ...section, usage: null };
}

function present<T>(name: string, section: T | undefined): Readonly<Record<string, T>> {
  return section === undefined ? {} : { [name]: section };
}

function projectedSections(
  source: PhoneDetail,
  tier: Exclude<PhoneTier, 'person'>,
): Readonly<Record<string, unknown>> {
  const member = tier === 'member';
  const { power, sound, screen, network, connections, storage, apps, notifications, alarm } =
    source;
  return {
    ...present('power', power),
    ...present('alarm', alarm),
    ...present('sound', sound && ownerSound(sound)),
    ...present('screen', screen && (member ? memberScreen(screen) : screen)),
    ...present('network', network && ownerNetwork(network, member)),
    ...(member
      ? {}
      : {
          ...present('connections', connections && ownerConnections(connections)),
          ...present('storage', storage && ownerStorage(storage)),
          ...present('apps', apps && ownerApps(apps)),
          ...present('notifications', notifications && ownerNotifications(notifications)),
        }),
  };
}

export function phoneDetailFor(detail: PhoneDetail, tier: PhoneTier): PhoneDetail {
  if (tier === 'person') return detail;
  return PHONE_DETAIL.parse(projectedSections(detail, tier));
}

export function phoneDetailPartsFor(parts: PhoneDetail, tier: PhoneTier): PhoneDetail | null {
  const projected = tier === 'person' ? parts : projectedSections(parts, tier);
  if (Object.keys(projected).length === 0) return null;
  return tier === 'person' ? parts : PHONE_DETAIL.parse(projected);
}
