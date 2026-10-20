import { describe, expect, it } from 'vitest';
import { catalogueLine, catalogueText } from '../../src/ai-tools/catalogue-text';
import { TOOLS } from '../../src/extensions/mcp/tools';
import { liveWindow } from '../../src/assistant-voice/live-window';
import { ASSISTANT_SETTINGS } from '@smarteverything/domain';
import { z } from 'zod';

const LISTING = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
});

const SPEC = {
  name: 'set_level',
  description: 'Sets a level.\n  On one device.',
  inputSchema: {
    type: 'object',
    properties: {
      deviceId: { type: 'string' },
      level: { type: 'integer' },
      mode: { enum: ['low', 'high'] },
      targets: {
        type: 'array',
        items: { type: 'object', properties: { id: {} }, required: ['id'] },
      },
      unit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    required: ['deviceId', 'level'],
  },
};

describe('the tool catalogue text', () => {
  it('writes one line per tool with its parameters and description', () => {
    expect(catalogueLine(SPEC)).toBe(
      'set_level(deviceId: string, level: integer, mode?: "low"|"high", targets?: {id}[], unit?: string|null): Sets a level. On one device.',
    );
  });

  it('lists every registry tool once, sorted, so the cached prompt is stable', () => {
    const listings = TOOLS.map((tool) => LISTING.parse(tool.listing));
    const text = catalogueText(listings);
    const names = text.split('\n').map((line) => line.slice(0, line.indexOf('(')));
    expect(names).toEqual([...TOOLS.map((tool) => tool.name)].sort((a, b) => a.localeCompare(b)));
    expect(catalogueText([...listings].reverse())).toBe(text);
    expect(text).not.toContain('find_tools');
  });
});

describe('the Live context window', () => {
  const windowFor = (settings: Record<string, unknown>): ReturnType<typeof liveWindow> =>
    liveWindow(ASSISTANT_SETTINGS.parse(settings));
  const minutes = (count: number): ReturnType<typeof liveWindow> =>
    windowFor({ voice: { live_context_minutes: count } });

  it('triggers compaction above the size it compacts down to, whatever the compaction percent', () => {
    const standard = windowFor({});
    expect(standard.triggerTokens).toBeGreaterThan(standard.targetTokens);
    expect(windowFor({ compact_at_percent: 95 })).toEqual(standard);
    expect(windowFor({ compact_at_percent: 50 })).toEqual(standard);
  });

  it('grows evenly with the chosen number of minutes', () => {
    const [short, middle, long] = [minutes(4), minutes(8), minutes(12)];
    expect(middle.targetTokens).toBeGreaterThan(short.targetTokens);
    expect(middle.triggerTokens).toBeGreaterThan(short.triggerTokens);
    expect(long.targetTokens - middle.targetTokens).toBe(middle.targetTokens - short.targetTokens);
  });

  it('limits the window of the model the thinking level selects', () => {
    const thinking = windowFor({ voice: { thinking_level: 'high' } });
    expect(Number.isFinite(thinking.triggerTokens)).toBe(true);
    expect(Number.isFinite(windowFor({}).triggerTokens)).toBe(true);
  });
});
