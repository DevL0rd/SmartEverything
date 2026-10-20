import {
  COMPUTER_TRIGGER_EVENTS,
  PHONE_TRIGGER_EVENTS,
  type JsonValue,
  type MatcherVariant,
  type SignalInput,
} from '@smarteverything/domain';

export type TriggerPayload = Readonly<Record<string, JsonValue>>;

export interface TriggerFire {
  readonly automationId: string;
  readonly triggerId: string;
  readonly key: string;
  readonly kind: string;
  readonly at: string;
  readonly payload: TriggerPayload;
}

type Draft = Readonly<Record<string, JsonValue | undefined>>;

function present(draft: Draft): TriggerPayload {
  const kept: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(draft)) {
    if (value !== undefined) kept[name] = value;
  }
  return kept;
}

function healthEvent(signal: SignalInput): string {
  if (signal.field === 'battery') return 'battery_low';
  return signal.value === true ? 'online' : 'offline';
}

function eventName(
  variants: Readonly<Record<string, MatcherVariant>>,
  signal: SignalInput,
): string {
  return (
    Object.entries(variants).find(([, variant]) => variant.kind === signal.kind)?.[0] ?? signal.kind
  );
}

const MAPPERS: Readonly<Record<string, (signal: SignalInput) => Draft>> = {
  'trigger.signal': (signal) => ({
    source: signal.source,
    kind: signal.kind,
    subject: signal.subject ?? undefined,
    field: signal.field ?? undefined,
    value: signal.value,
    previous: signal.previous ?? undefined,
    data: signal.data,
    profile: signal.profileId ?? undefined,
  }),
  'trigger.device': (signal) => ({
    device: signal.subject ?? undefined,
    control: signal.field ?? undefined,
    value: signal.value,
    previous: signal.previous ?? undefined,
    cause: signal.data['cause'],
    room: signal.data['roomId'],
  }),
  'trigger.presence': (signal) => ({
    person: signal.data['person_id'],
    place: signal.data['place'] ?? 'home',
    event: signal.kind === 'person_left' ? 'left' : 'arrived',
  }),
  'trigger.camera': (signal) => ({
    camera: signal.subject ?? undefined,
    detection: signal.data['detection'] ?? signal.kind,
    confidence: signal.data['confidence'],
    snapshot: signal.data['snapshot'],
  }),
  'trigger.button': (signal) => ({
    device: signal.subject ?? undefined,
    press: signal.data['action'],
  }),
  'trigger.value': (signal) => ({
    value: signal.value,
    previous: signal.previous ?? undefined,
  }),
  'trigger.run_status': (signal) => ({
    automation: signal.subject ?? undefined,
    runId: signal.data['runId'],
    status: signal.data['status'],
    error: signal.data['error'],
  }),
  'trigger.device_health': (signal) => ({
    device: signal.subject ?? undefined,
    event: healthEvent(signal),
    battery: signal.field === 'battery' ? signal.value : signal.data['battery'],
  }),
  'trigger.computer': (signal) => ({
    computer: signal.subject ?? undefined,
    kind: eventName(COMPUTER_TRIGGER_EVENTS, signal),
    app: signal.data['app'],
    title: signal.data['title'],
    action: signal.data['action'],
  }),
  'trigger.phone': (signal) => ({
    phone: signal.subject ?? undefined,
    kind: eventName(PHONE_TRIGGER_EVENTS, signal),
    data: signal.data,
  }),
  'trigger.health': (signal) => ({
    kind: signal.kind,
    metric: signal.field ?? undefined,
    value: signal.value,
    person: signal.profileId ?? signal.subject ?? undefined,
    data: signal.data,
  }),
  'trigger.weather': (signal) => ({
    event: signal.kind,
    metric: signal.field ?? undefined,
    value: signal.value,
    previous: signal.previous ?? undefined,
    data: signal.data,
  }),
  'trigger.event': (signal) => ({
    name: signal.field ?? undefined,
    payload: Object.fromEntries(
      Object.entries(signal.data).filter(([key]) => key !== 'automationId'),
    ),
  }),
  'trigger.timer': (signal) => ({ timer: signal.field ?? undefined }),
  'trigger.webhook': (signal) => ({
    method: signal.data['method'],
    body: signal.data['body'],
    headers: signal.data['headers'],
    query: signal.data['query'],
  }),
  'trigger.hub_started': (signal) => ({ downFor: signal.data['downFor'] }),
  'trigger.chat': (signal) => ({
    chat: signal.subject ?? undefined,
    outcome: signal.data['outcome'],
    messageId: signal.data['messageId'],
    person: signal.profileId ?? undefined,
  }),
};

export function signalPayload(kindId: string, signal: SignalInput): TriggerPayload {
  const mapper = MAPPERS[kindId];
  return { ...(mapper === undefined ? {} : present(mapper(signal))), at: signal.at };
}

export function timedPayload(at: Date, scheduledFor: Date, extra: Draft = {}): TriggerPayload {
  return { ...present(extra), at: at.toISOString(), scheduledFor: scheduledFor.toISOString() };
}

export function triggerPayload(fire: TriggerFire): TriggerPayload {
  return { ...fire.payload, key: fire.key, at: fire.at };
}

export function triggerScope(fire: TriggerFire): Readonly<Record<string, JsonValue>> {
  return { trigger: triggerPayload(fire) };
}
