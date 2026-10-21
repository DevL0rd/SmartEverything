import { Logger } from '@smarteverything/logging';
import { reachedCall, voiceListOf } from './voice-shapes';

type Json = Readonly<Record<string, unknown>>;

const log = new Logger('hub.voice-results');

interface Projection {
  readonly drop: ReadonlySet<string>;
}

const FLAGS_DROPPED_WHEN_FALSE: ReadonlySet<string> = new Set(['favourite', 'hidden']);

const PROJECTIONS: ReadonlyMap<string, Projection> = new Map([
  [
    'home_read',
    { drop: new Set(['position', 'updated_at', 'latitude', 'longitude', 'sign_in', 'room_id']) },
  ],
  [
    'device_find',
    {
      drop: new Set([
        'provider',
        'model',
        'manufacturer',
        'room_id',
        'updated_at',
        'observed_at',
        'details',
        'group',
        'tier',
        'access',
      ]),
    },
  ],
  [
    'device_read',
    {
      drop: new Set(['details', 'updated_at', 'observed_at', 'group', 'tier', 'access', 'room_id']),
    },
  ],
]);

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0)
  );
}

function pruned(value: unknown, projection: Projection): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => pruned(entry, projection));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, entry]) =>
          !projection.drop.has(key) && !(entry === false && FLAGS_DROPPED_WHEN_FALSE.has(key)),
      )
      .map(([key, entry]) => [key, pruned(entry, projection)])
      .filter(([, entry]) => !isEmpty(entry)),
  );
}

export const VOICE_RESULT_GUARD_CHARS = 16_000;

const OVER_GUARD =
  'This result was larger than a voice call can take, so only its start is here. Say that the list was too long and ask the tool again with a narrower request.';

function lastResortGuard(tool: string, response: Json): Json {
  const text = JSON.stringify(response);
  if (text.length <= VOICE_RESULT_GUARD_CHARS) {
    return response;
  }
  log.warn('voice.result_over_guard', {
    tool,
    chars: text.length,
    guardChars: VOICE_RESULT_GUARD_CHARS,
  });
  return { over_guard: OVER_GUARD, start: text.slice(0, VOICE_RESULT_GUARD_CHARS) };
}

function projected(tool: string, response: Json): Json {
  const projection = PROJECTIONS.get(tool);
  if (projection === undefined || 'error' in response) {
    return response;
  }
  const result = pruned(response, projection);
  return isRecord(result) ? result : response;
}

export function voiceResponseOf(
  name: string,
  args: Readonly<Record<string, unknown>>,
  response: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const tool = reachedCall(name, args).name;
  const shaped = voiceListOf(name, args, response) ?? response;
  return lastResortGuard(tool, projected(tool, shaped));
}
