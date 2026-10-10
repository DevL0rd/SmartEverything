import {
  SIGNAL_SOURCES,
  kindSpecOf,
  localClock,
  type JsonValue,
  type SignalInput,
  type SignalKindSpec,
  type SignalSubject,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { unlessGone } from './unless-gone';

const VALUE_TEXT_MAX = 300;
const DETAILS_TEXT_MAX = 600;
const MINUTES_PER_HOUR = 60;

export type WakeNameStore = Pick<
  Store,
  'devices' | 'profiles' | 'aiChats' | 'schedules' | 'automations' | 'settings'
>;

export interface WakeOccasion {
  readonly automationName: string;
  readonly signal: SignalInput | null;
  readonly instruction: string;
  readonly at: Date;
}

export interface WakeLines {
  readonly headline: string;
  readonly text: string;
}

function clipped(text: string, longest: number): string {
  return text.length > longest ? `${text.slice(0, longest - 1)}…` : text;
}

function valueText(value: JsonValue): string {
  return clipped(typeof value === 'string' ? value : JSON.stringify(value), VALUE_TEXT_MAX);
}

function clockText(at: Date, timeZone: string): string {
  const minute = localClock(at, timeZone).minuteOfDay;
  const hours = Math.floor(minute / MINUTES_PER_HOUR);
  return `${String(hours).padStart(2, '0')}:${String(minute % MINUTES_PER_HOUR).padStart(2, '0')}`;
}

export class WakeText {
  constructor(private readonly store: WakeNameStore) {}

  lines(occasion: WakeOccasion): WakeLines {
    const time = clockText(occasion.at, this.store.settings.read().time_zone);
    const signal = occasion.signal;
    const headline =
      signal === null
        ? `${occasion.automationName} · ${time}`
        : [this.whatOf(signal), this.subjectName(signal), time]
            .filter((part): part is string => part !== null)
            .join(' · ');
    const body = [
      `[Wake] ${headline}`,
      `Routine: ${occasion.automationName}`,
      ...(signal === null ? ['It ran on its schedule.'] : this.signalLines(signal)),
      `Do this: ${occasion.instruction}`,
    ];
    return { headline: clipped(headline, 300), text: body.join('\n') };
  }

  private specOf(signal: SignalInput): SignalKindSpec | undefined {
    return kindSpecOf(SIGNAL_SOURCES, signal);
  }

  private whatOf(signal: SignalInput): string {
    const spec = this.specOf(signal);
    const field = this.fieldLabel(signal, spec);
    const kind = spec?.label ?? signal.kind;
    return field === null ? kind : `${kind}: ${field}`;
  }

  private fieldLabel(signal: SignalInput, spec: SignalKindSpec | undefined): string | null {
    if (signal.field === null || spec === undefined || spec.fields === 'capabilities') {
      return signal.field;
    }
    return spec.fields.find((entry) => entry.field === signal.field)?.label ?? signal.field;
  }

  private signalLines(signal: SignalInput): string[] {
    const subject = this.subjectName(signal);
    const unit = this.unitOf(signal);
    const value = `${valueText(signal.value)}${unit === null ? '' : ` ${unit}`}`;
    const details = Object.keys(signal.data).length === 0 ? null : JSON.stringify(signal.data);
    return [
      `What happened: ${this.whatOf(signal)}`,
      ...(subject === null ? [] : [`About: ${subject} (id ${signal.subject ?? ''})`]),
      `Value: ${value}${signal.previous === null ? '' : ` (was ${valueText(signal.previous)})`}`,
      ...(details === null ? [] : [`Details: ${clipped(details, DETAILS_TEXT_MAX)}`]),
    ];
  }

  private unitOf(signal: SignalInput): string | null {
    const spec = this.specOf(signal);
    if (spec === undefined || spec.fields === 'capabilities') {
      return null;
    }
    return spec.fields.find((entry) => entry.field === signal.field)?.unit ?? null;
  }

  private subjectName(signal: SignalInput): string | null {
    const id = signal.subject;
    const kind: SignalSubject | undefined = this.specOf(signal)?.subject;
    return id === null || kind === undefined ? null : unlessGone(() => this.nameOf(kind, id));
  }

  private nameOf(kind: SignalSubject, id: string): string | null {
    return this.namers[kind]?.(id) ?? null;
  }

  private readonly namers: Readonly<Record<SignalSubject, ((id: string) => string | null) | null>> =
    {
      device: (id) => this.deviceName(id),
      camera: (id) => this.deviceName(id),
      profile: (id) => this.store.profiles.byId(id).name,
      chat: (id) => this.store.aiChats.chat(id).title,
      schedule: (id) => this.store.schedules.byId(id).label,
      automation: (id) => this.store.automations.byId(id).name,
      client: null,
      channel: null,
      planner_item: null,
      none: null,
    };

  private deviceName(id: string): string | null {
    const device = this.store.devices.find(id);
    return device === undefined ? null : (device.display_name ?? device.name);
  }
}
