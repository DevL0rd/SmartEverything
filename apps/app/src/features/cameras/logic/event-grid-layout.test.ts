import { describe, expect, it } from 'vitest';
import { eventGridLayout } from './event-grid-layout';

describe('latest camera event grid', () => {
  it('uses a second preview row when both rows and their gap fit in the widget', () => {
    const row = { width: 346, height: 148 };
    expect(eventGridLayout({ width: 346, height: 353 }, row)).toEqual({ columns: 2, rows: 2 });
    expect(eventGridLayout({ width: 346, height: 307 }, row)).toEqual({ columns: 2, rows: 1 });
    expect(eventGridLayout({ width: 346, height: 308 }, row)).toEqual({ columns: 2, rows: 2 });
  });

  it('keeps the wider single row and waits for its measurement after resizing', () => {
    const frame = { width: 1070, height: 222 };
    expect(eventGridLayout(frame, { width: 1070, height: 195 })).toEqual({ columns: 4, rows: 1 });
    expect(eventGridLayout(frame, { width: 346, height: 80 })).toEqual({ columns: 4, rows: 1 });
  });
});
