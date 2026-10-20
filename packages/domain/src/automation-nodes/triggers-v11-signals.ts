import { COMPUTER_ACTIONS } from '../node/node-requests';
import { WEATHER_SIGNAL_KINDS } from '../weather/signals';
import type { MatcherMapping, MatcherVariant } from './triggers-device';

export const COMPUTER_TRIGGER_EVENTS: Readonly<Record<string, MatcherVariant>> = {
  app_open: { source: 'event', kind: 'app_opened' },
  app_focus: { source: 'event', kind: 'app_focused' },
  app_close: { source: 'event', kind: 'app_closed' },
  app_unfocus: { source: 'event', kind: 'app_unfocused' },
  power: { source: 'event', kind: 'computer_power' },
  ...Object.fromEntries(
    COMPUTER_ACTIONS.map((action) => [
      `power_${action}`,
      { source: 'event', kind: 'computer_power', match: { action } },
    ]),
  ),
};

export const PHONE_TRIGGER_EVENTS: Readonly<Record<string, MatcherVariant>> = {
  unlocked: { source: 'event', kind: 'phone_unlocked' },
  context_changed: { source: 'event', kind: 'phone_context_changed' },
  parked: { source: 'event', kind: 'parked' },
};

export const HEALTH_TRIGGER_KINDS = ['sleep_ended', 'body_reading', 'today', 'logged'] as const;

export const CHAT_OUTCOMES = ['answered', 'failed'] as const;

export const WEATHER_TRIGGER_EVENTS = ['forecast', ...WEATHER_SIGNAL_KINDS] as const;

export const V11_MATCHER_MAPPINGS: Readonly<Record<string, MatcherMapping>> = {
  'trigger.weather': {
    variantPort: 'event',
    defaultVariant: 'changed',
    variants: Object.fromEntries(
      WEATHER_TRIGGER_EVENTS.map((kind) => [kind, { source: 'weather', kind }]),
    ),
    subjectPort: null,
    fieldPort: 'metric',
    matchPorts: { to: 'to', from: 'from', falling: 'kind', within: 'within' },
    runtimePorts: [],
  },
  'trigger.computer': {
    variantPort: 'kind',
    defaultVariant: 'app_open',
    variants: COMPUTER_TRIGGER_EVENTS,
    subjectPort: 'computer',
    fieldPort: null,
    matchPorts: { app: 'app', title: 'title' },
    runtimePorts: [],
  },
  'trigger.phone': {
    variantPort: 'kind',
    defaultVariant: 'unlocked',
    variants: PHONE_TRIGGER_EVENTS,
    subjectPort: 'phone',
    fieldPort: null,
    matchPorts: { to: 'to', from: 'from' },
    runtimePorts: [],
  },
  'trigger.health': {
    variantPort: 'kind',
    defaultVariant: 'sleep_ended',
    variants: Object.fromEntries(
      HEALTH_TRIGGER_KINDS.map((kind) => [kind, { source: 'health', kind }]),
    ),
    subjectPort: 'person',
    fieldPort: 'metric',
    matchPorts: {},
    runtimePorts: [],
  },
  'trigger.event': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'automation_event', kind: 'sent' } },
    subjectPort: null,
    fieldPort: 'name',
    matchPorts: {},
    runtimePorts: [],
  },
  'trigger.timer': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'automation_timer', kind: 'finished' } },
    subjectPort: null,
    fieldPort: 'timer',
    matchPorts: {},
    runtimePorts: [],
  },
  'trigger.webhook': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'webhook', kind: 'received' } },
    subjectPort: null,
    fieldPort: 'path',
    matchPorts: { method: 'method' },
    runtimePorts: [],
  },
  'trigger.hub_started': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'hub', kind: 'started' } },
    subjectPort: null,
    fieldPort: null,
    matchPorts: {},
    runtimePorts: [],
  },
  'trigger.chat': {
    variantPort: null,
    defaultVariant: '',
    variants: { '': { source: 'assistant', kind: 'reply_finished' } },
    subjectPort: 'chat',
    fieldPort: null,
    matchPorts: { outcome: 'outcome' },
    runtimePorts: [],
  },
};
