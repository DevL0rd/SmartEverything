import {
  ApiError,
  SPEECH_TRIGGER,
  type AutomationV4,
  type JsonValue,
  type SpeechTrigger,
} from '@smarteverything/domain';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import { speechPrincipal, type SpeechPrincipal } from '../transcripts/speech-principal';
import { admitSpeechSources } from '../transcripts/speech-readers';
import { requireSamePrincipal, type SpeechPlan } from './program-speech';

const SPEECH_KIND = 'trigger.speech';
const DEVICE_SOURCES = ['camera', 'phone', 'computer'] as const;

type Record_ = Readonly<Record<string, JsonValue>>;

function isRecord(value: JsonValue | undefined): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordOf(value: JsonValue | undefined): Record_ | undefined {
  return isRecord(value) ? value : undefined;
}

function speechSource(record: Record_ | undefined): unknown {
  if (record === undefined) return null;
  const device = DEVICE_SOURCES.find((kind) => typeof record[kind] === 'string');
  if (device !== undefined) return { kind: device, deviceId: record[device] };
  if (typeof record['chat'] === 'string') return { kind: 'attachment', chatId: record['chat'] };
  return { kind: 'plugin', pluginId: record['plugin'], sourceId: record['sourceId'] };
}

function literalPort(
  trigger: AutomationV4['triggers'][number],
  port: string,
): JsonValue | undefined {
  const value = trigger.ports[port];
  if (value === undefined) return undefined;
  if (!('lit' in value)) {
    throw new ApiError(
      'invalid_request',
      `The speech trigger's ${port} must be typed in, not wired.`,
    );
  }
  return value.lit;
}

function speechTriggersOf(program: AutomationV4): readonly SpeechTrigger[] {
  return program.triggers
    .filter((trigger) => trigger.kind === SPEECH_KIND)
    .map((trigger) => {
      const parsed = SPEECH_TRIGGER.safeParse({
        type: 'speech',
        phrase: literalPort(trigger, 'phrase'),
        caseSensitive: literalPort(trigger, 'caseSensitive') ?? false,
        includeBots: literalPort(trigger, 'includeBots') ?? false,
        source: speechSource(recordOf(literalPort(trigger, 'source'))),
      });
      if (!parsed.success) {
        throw new ApiError(
          'invalid_request',
          `The speech trigger is not valid: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    });
}

export function speechPlan(
  store: Store,
  caller: Caller,
  program: AutomationV4,
  prior: SpeechPrincipal | null,
): SpeechPlan {
  const triggers = speechTriggersOf(program);
  if (triggers.length === 0 && prior === null) return { kind: 'none' };
  const principal = speechPrincipal(store, caller);
  requireSamePrincipal(prior, principal);
  if (triggers.length === 0) return { kind: 'remove', principal };
  return { kind: 'bind', principal, bound: admitSpeechSources(store, principal, triggers) };
}
