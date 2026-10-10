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
  it('slides at the compaction percent of the Live model’s window', () => {
    const settings = ASSISTANT_SETTINGS.parse({ compact_at_percent: 80 });
    expect(liveWindow(settings)).toEqual({ triggerTokens: 102_400, targetTokens: 64_000 });
  });

  it('leaves the window alone for a model without a known length', () => {
    const settings = ASSISTANT_SETTINGS.parse({ voice: { model: 'gemini-unknown-live' } });
    expect(liveWindow(settings)).toBeNull();
  });
});
