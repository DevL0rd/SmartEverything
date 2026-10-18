import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HEALTH_BATCH_LIMIT,
  OUTREACH_RING_SECONDS,
  PUSH_COMMAND_KEY,
  PUSH_COMMANDS,
  PUSH_PAYLOAD_KEY,
  WATCH_SPORT_LABELS,
  WATCH_SPORTS,
} from '../src';

const GENERATED = readFileSync(
  new URL(
    '../../../apps/app/modules/health-connect/android/src/main/java/expo/modules/healthconnect/DomainConstants.kt',
    import.meta.url,
  ),
  'utf8',
);

function constants(): ReadonlyMap<string, string> {
  return new Map(
    [...GENERATED.matchAll(/const val (\w+) = (\d+|"[^"]*")/g)].map((match) => [
      match[1] ?? '',
      (match[2] ?? '').replaceAll('"', ''),
    ]),
  );
}

function sports(): readonly string[] {
  const list = /listOf\(([^)]*)\)/.exec(GENERATED)?.[1] ?? '';
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('the Kotlin constants generated from the domain', () => {
  it('carry the batch limit, the ring time and the push envelope keys', () => {
    const found = constants();
    expect(found.get('HEALTH_BATCH_LIMIT')).toBe(String(HEALTH_BATCH_LIMIT));
    expect(found.get('OUTREACH_RING_SECONDS')).toBe(String(OUTREACH_RING_SECONDS));
    expect(found.get('PUSH_COMMAND_KEY')).toBe(PUSH_COMMAND_KEY);
    expect(found.get('PUSH_PAYLOAD_KEY')).toBe(PUSH_PAYLOAD_KEY);
  });

  it('name every push command and no other', () => {
    const named = [...constants()]
      .filter(([name]) => name.startsWith('PUSH_COMMAND_') && name !== 'PUSH_COMMAND_KEY')
      .map(([, value]) => value);
    expect(named).toStrictEqual([...PUSH_COMMANDS]);
  });

  it('list every watch sport the labels name, in their order', () => {
    expect(sports()).toStrictEqual([...WATCH_SPORTS]);
    expect(sports()).toStrictEqual(Object.keys(WATCH_SPORT_LABELS));
  });
});
