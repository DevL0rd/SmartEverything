import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { waterEntryOf, type HealthEntryRow } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => new Array<Record<string, unknown>>());

vi.mock('../../../components/list-row', () => ({
  ListRow: (props: Record<string, unknown>): null => {
    rows.push(props);
    return null;
  },
}));
vi.mock('../../../components/section', () => ({
  List: ({ children }: { children: unknown }): unknown => children,
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('./entry-rows', () => ({ WaterEntryRow: (): null => null }));

const { WaterGroup, waterSummary } = await import('./water-group');
const { entrySpan } = await import('../model/day');

function glass(id: string, ml: number): HealthEntryRow {
  const input = waterEntryOf(ml, entrySpan(Date.parse('2026-10-10T10:00:00Z')));
  return {
    id,
    profile_id: 'profile-1',
    record_type: input.type,
    start_time: input.startTime,
    end_time: input.endTime,
    zone_offset_seconds: input.zoneOffsetSeconds,
    data: input.data,
    food: input.food,
    version: 1,
    save_error: null,
    source: null,
    created_at: input.startTime,
    updated_at: input.startTime,
  };
}

describe('waterSummary', () => {
  it('adds the glasses up', () => {
    const summary = waterSummary([glass('a', 250), glass('b', 250), glass('c', 500)]);
    expect(summary.millilitres).toBe(1000);
    expect(summary.label).toContain('3 glasses');
  });

  it('names one glass in the singular', () => {
    expect(waterSummary([glass('a', 250)]).label).toContain('1 glass');
    expect(waterSummary([glass('a', 250)]).label).not.toContain('glasses');
  });
});

describe('WaterGroup', () => {
  it('shows four glasses as one row until it is opened', () => {
    rows.length = 0;
    const entries = [glass('a', 250), glass('b', 250), glass('c', 250), glass('d', 250)];
    renderToStaticMarkup(createElement(WaterGroup, { entries }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['title']).toContain('4 glasses');
  });
});
