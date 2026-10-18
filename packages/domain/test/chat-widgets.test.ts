import { describe, expect, it } from 'vitest';
import {
  CHAT_WIDGETS_MAX,
  SHOW_WIDGETS_INPUT,
  SHOW_WIDGETS_TEXT,
  chatWidgetKey,
  chatWidgetsOf,
  isChatLink,
  newChatWidgets,
  type ChatWidget,
} from '../src/chat-widgets';

const DEVICE = '11111111-1111-4111-8111-111111111111';

const SAMPLES: readonly [ChatWidget, string][] = [
  [{ kind: 'device', id: DEVICE }, `device:${DEVICE}`],
  [{ kind: 'weather' }, 'weather'],
  [
    { kind: 'health', metric: 'steps', range: 'week', day: '2026-10-01' },
    'health:steps:week:2026-10-01',
  ],
  [{ kind: 'health', metric: 'steps', range: 'today' }, 'health:steps:today:'],
  [{ kind: 'nutrition', part: 'macros' }, 'nutrition:macros:'],
  [{ kind: 'board', type: 'pool.level', options: { b: '2', a: '1' } }, 'board:pool.level:a=1&b=2'],
  [{ kind: 'board', type: 'pool.level' }, 'board:pool.level:'],
  [{ kind: 'page_link', page: 'plugin', id: 'pool', value: null }, 'page_link:plugin:pool'],
  [{ kind: 'page_link', page: 'costs', id: null, value: 'x' }, 'page_link:costs:'],
  [{ kind: 'setting_link', setting: 'time_zone', value: null }, 'setting_link:time_zone'],
];

describe('chat widgets', () => {
  it.each(SAMPLES)('keys %j as %s', (widget, key) => {
    expect(chatWidgetKey(widget)).toBe(key);
  });

  it('keeps only the embeds that are widgets', () => {
    expect(chatWidgetsOf([{ kind: 'weather' }, { kind: 'hologram' }, 'text'])).toEqual([
      { kind: 'weather' },
    ]);
  });

  it('recognises links', () => {
    expect(isChatLink({ kind: 'room_link', id: DEVICE, value: null })).toBe(true);
    expect(isChatLink({ kind: 'weather' })).toBe(false);
  });

  it('returns each wanted widget once and none that are already known, without capping', () => {
    const known: ChatWidget[] = [{ kind: 'weather' }];
    const wanted: ChatWidget[] = Array.from({ length: CHAT_WIDGETS_MAX + 2 }, (_, index) => ({
      kind: 'setting_link',
      setting: `s${String(index)}`,
      value: null,
    }));
    const fresh = newChatWidgets(known, [{ kind: 'weather' }, ...wanted, ...wanted.slice(0, 1)]);
    expect(fresh).toEqual(wanted);
  });

  it('accepts at most six widgets in one call and says so in the tool text', () => {
    const many = Array.from({ length: CHAT_WIDGETS_MAX + 1 }, () => ({ kind: 'weather' }));
    expect(SHOW_WIDGETS_INPUT.safeParse({ widgets: many }).success).toBe(false);
    expect(SHOW_WIDGETS_TEXT).toContain('dropped');
  });
});
