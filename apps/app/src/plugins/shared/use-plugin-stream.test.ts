import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PLUGIN_STREAM_ROW, type JsonValue, type PluginStreamRow } from '@smarteverything/domain';
import { StreamParser } from './use-plugin-stream';

const row = (value: JsonValue, at: string): PluginStreamRow =>
  PLUGIN_STREAM_ROW.parse({ plugin_id: 'shelly-presence', stream: 's', value, at });

describe('StreamParser', () => {
  it('parses a shared value once across rows that differ only by timestamp', () => {
    const schema = z.object({ n: z.number() });
    const spy = vi.spyOn(schema, 'safeParse');
    const parser = new StreamParser(schema);
    const value = { n: 1 };
    const base = row(value, '2026-10-11T00:00:00.000Z');
    const first = parser.read(base);
    const second = parser.read({ ...base, at: '2026-10-11T00:00:01.000Z' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ state: 'ready', at: '2026-10-11T00:00:01.000Z' });
    expect(
      second.state === 'ready' && first.state === 'ready' && second.value === first.value,
    ).toBe(true);
  });

  it('collapses the same problem on many items into one line with a count', () => {
    const parser = new StreamParser(z.object({ items: z.array(z.object({ group: z.string() })) }));
    const stream = parser.read(row({ items: [{}, {}, {}] }, '2026-10-11T00:00:00.000Z'));
    expect(stream).toEqual({
      state: 'invalid',
      reason: 'Invalid input: expected string, received undefined at items[].group (3×)',
    });
  });
});
