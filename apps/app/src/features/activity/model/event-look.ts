import { EVENT_KIND_LABELS, type EventKind } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';

export type EventLookKind = EventKind | 'recording';

export interface EventLook {
  readonly icon: IconName;
  readonly tone: Tone;
  readonly label: string;
}

const LOOKS: Readonly<Record<EventLookKind, Omit<EventLook, 'label'>>> = {
  doorbell: { icon: 'bell', tone: 'warning' },
  call: { icon: 'phone', tone: 'info' },
  motion: { icon: 'motion', tone: 'primary' },
  person: { icon: 'users', tone: 'primary' },
  pet: { icon: 'dog', tone: 'primary' },
  sound: { icon: 'volume', tone: 'info' },
  alarm: { icon: 'siren', tone: 'critical' },
  activity: { icon: 'activity', tone: 'warning' },
  button: { icon: 'circle', tone: 'variant' },
  leak: { icon: 'leak', tone: 'critical' },
  smoke: { icon: 'smoke', tone: 'critical' },
  device_online: { icon: 'wifi', tone: 'positive' },
  device_offline: { icon: 'wifi', tone: 'faint' },
  automation_run: { icon: 'automations', tone: 'variant' },
  provider_error: { icon: 'alert', tone: 'critical' },
  opened: { icon: 'doorOpen', tone: 'variant' },
  maintenance: { icon: 'wrench', tone: 'warning' },
  fault: { icon: 'warning', tone: 'critical' },
  computer_power: { icon: 'power', tone: 'variant' },
  phone_context_changed: { icon: 'footprints', tone: 'variant' },
  place_arrived: { icon: 'mapPin', tone: 'positive' },
  place_left: { icon: 'mapPin', tone: 'variant' },
  parked: { icon: 'car', tone: 'variant' },
  recording: { icon: 'film', tone: 'variant' },
};

export function eventLook(kind: EventLookKind): EventLook {
  const look = LOOKS[kind];
  return { ...look, label: kind === 'recording' ? 'Recording' : EVENT_KIND_LABELS[kind] };
}
