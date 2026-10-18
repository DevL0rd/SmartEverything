import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { centredOn, isVisibleOn, placeWindow, type WindowState } from '../src/window-bounds.js';
import { readWindowState, writeWindowState } from '../src/window-state.js';

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 };
const SECOND = { x: 1920, y: 0, width: 2560, height: 1400 };

function saved(x: number, y: number): WindowState {
  return { bounds: { x, y, width: 1000, height: 700 }, maximized: false };
}

describe('placeWindow', () => {
  it('placeWindow keeps saved bounds that are on a connected display', () => {
    const state = saved(2100, 100);
    expect(
      placeWindow({ saved: state, workAreas: [PRIMARY, SECOND], primaryWorkArea: PRIMARY }),
    ).toBe(state);
  });

  it('placeWindow centres the window when its display was disconnected', () => {
    const placed = placeWindow({
      saved: { ...saved(2100, 100), maximized: true },
      workAreas: [PRIMARY],
      primaryWorkArea: PRIMARY,
    });
    expect(placed).toEqual({
      bounds: { x: 320, y: 120, width: 1280, height: 800 },
      maximized: true,
    });
  });

  it('placeWindow centres a first window on the primary display', () => {
    expect(
      placeWindow({ saved: undefined, workAreas: [PRIMARY], primaryWorkArea: PRIMARY }),
    ).toEqual({
      bounds: { x: 320, y: 120, width: 1280, height: 800 },
      maximized: false,
    });
  });

  it('placeWindow refuses bounds that show only a sliver of the window', () => {
    const sliver = saved(1920 - 40, 100);
    expect(
      placeWindow({ saved: sliver, workAreas: [PRIMARY], primaryWorkArea: PRIMARY }).bounds,
    ).toEqual(centredOn(PRIMARY));
  });

  it('placeWindow always answers bounds visible on some display', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 10000 }),
        fc.integer({ min: -10000, max: 10000 }),
        (x, y) => {
          const placed = placeWindow({
            saved: saved(x, y),
            workAreas: [PRIMARY, SECOND],
            primaryWorkArea: PRIMARY,
          });
          expect([PRIMARY, SECOND].some((area) => isVisibleOn(placed.bounds, area))).toBe(true);
        },
      ),
    );
  });

  it('centredOn never makes the window smaller than its minimum size', () => {
    expect(centredOn({ x: 0, y: 0, width: 400, height: 300 })).toEqual({
      x: -40,
      y: -30,
      width: 480,
      height: 360,
    });
  });
});

describe('window state file', () => {
  let directory = '';
  const logged: LogRecord[] = [];

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'desktop-window-state-'));
    logged.length = 0;
    Logger.reset();
    Logger.configure({ level: 'trace', sink: (record) => logged.push(record) });
  });

  afterEach(() => {
    Logger.reset();
    rmSync(directory, { recursive: true, force: true });
  });

  it('readWindowState answers undefined before any state was saved', () => {
    expect(readWindowState(path.join(directory, 'window-state.json'))).toBeUndefined();
  });

  it('readWindowState returns what writeWindowState saved', () => {
    const file = path.join(directory, 'window-state.json');
    writeWindowState(file, { bounds: { x: -5, y: 10, width: 900, height: 600 }, maximized: true });
    expect(readWindowState(file)).toEqual({
      bounds: { x: -5, y: 10, width: 900, height: 600 },
      maximized: true,
    });
  });

  it('readWindowState opens centred and logs once when the file is not JSON', () => {
    const file = path.join(directory, 'window-state.json');
    writeFileSync(file, '{not json', 'utf8');
    expect(readWindowState(file)).toBeUndefined();
    expect(logged).toHaveLength(1);
    expect(logged[0]?.event).toBe('window.state_unreadable');
    expect(logged[0]?.payload).toMatchObject({ file });
  });

  it('readWindowState opens centred and logs once when the bounds are below the minimum window size', () => {
    const file = path.join(directory, 'window-state.json');
    writeFileSync(
      file,
      JSON.stringify({ bounds: { x: 0, y: 0, width: 10, height: 10 }, maximized: false }),
      'utf8',
    );
    expect(readWindowState(file)).toBeUndefined();
    expect(logged).toHaveLength(1);
  });

  it('readWindowState stays quiet when no state was saved yet and after a broken file is overwritten', () => {
    const file = path.join(directory, 'window-state.json');
    expect(readWindowState(file)).toBeUndefined();
    writeFileSync(file, '{not json', 'utf8');
    writeWindowState(file, { bounds: { x: 0, y: 0, width: 900, height: 600 }, maximized: false });
    logged.length = 0;
    expect(readWindowState(file)).toEqual({
      bounds: { x: 0, y: 0, width: 900, height: 600 },
      maximized: false,
    });
    expect(logged).toHaveLength(0);
  });
});
