import { describe, expect, it } from 'vitest';
import {
  ComponentStat,
  commitStat,
  componentStat,
  addFrame,
  emptyWindow,
  listStat,
} from './collector';
import { LINES_MAX, LINE_MAX, STORM_RENDERS } from './config';
import { chosenComponents, encodeWindow, packLines, safe, type WindowMeta } from './encode';

const META: WindowMeta = {
  boot: 'a1b2',
  seq: 3,
  version: '0.1.0',
  theme: 'dark',
  heapMb: 41.5,
  gcCount: 2,
  gcMs: 12,
  fibers: 2,
  screen: 'assistant/chat',
  visited: 'home:2.5,assistant/chat:7.5',
};

function parse(line: string): Record<string, unknown> {
  const value: unknown = JSON.parse(line);
  if (typeof value !== 'object' || value === null) {
    throw new Error('line is not an object');
  }
  return Object.fromEntries(Object.entries(value));
}

describe('packLines', () => {
  it('keeps every line under the limit and loses no row', () => {
    const rows = Array.from({ length: 60 }, (_, index) => [
      'component' + String(index),
      index,
      1.5,
    ]);
    const lines = packLines({ t: 'g', b: 'x', w: 1 }, 'g', rows);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(LINE_MAX);
    });
    const back = lines.flatMap((line): unknown[] => {
      const rowsOf = parse(line)['g'];
      return Array.isArray(rowsOf) ? rowsOf.map((row: unknown) => row) : [];
    });
    expect(back).toHaveLength(60);
  });

  it('returns nothing for no rows', () => {
    expect(packLines({ t: 'n' }, 'n', [])).toEqual([]);
  });
});

describe('safe', () => {
  it('cuts long identifier runs so redaction never rewrites them', () => {
    expect(safe('assistant/' + 'a'.repeat(40), 60)).toBe('assistant/' + 'a'.repeat(20));
  });
});

describe('chosenComponents', () => {
  it('keeps storming components and the heaviest ones', () => {
    const stats = new Map(
      Array.from({ length: 12 }, (_, index) => {
        const stat = new ComponentStat();
        stat.add(index === 11 ? STORM_RENDERS + 5 : 2, index, null);
        return [`C${String(index)}`, stat] as const;
      }),
    );
    const names = chosenComponents(stats).map(([name]) => name);
    expect(names).toContain('C11');
    expect(names).toContain('C10');
    expect(names.length).toBeLessThanOrEqual(8);
  });
});

describe('encodeWindow', () => {
  it('writes a header first and every line as parseable JSON under the limit', () => {
    const data = emptyWindow();
    for (let index = 0; index < 40; index += 1) {
      commitStat(data, 'devices/index', `id${String(index)}`).add(index, index === 0);
    }
    addFrame(data, 120, false);
    componentStat(data, 'devices/index', 'DeviceCard')?.add(3, 4.2, {
      props: ['onPress'],
      hooks: ['h1'],
      parent: false,
    });
    listStat(data, 'devices/index', 'models').mountedMax = 9;
    data.stalls.push({
      screen: 'devices/index',
      gap: 250,
      explained: 40,
      top: 'DeviceCard',
      context: ['tap@-12', 'store:devices@3'],
    });
    const lines = encodeWindow(data, META);
    expect(lines.length).toBeLessThanOrEqual(LINES_MAX);
    const header = parse(lines[0] ?? '');
    expect(header['t']).toBe('w');
    expect(header['b']).toBe('a1b2');
    expect(header['fr']).toEqual([1, 1, 120]);
    expect(header['s']).toBe('assistant/chat');
    expect(header['vis']).toBe('home:2.5,assistant/chat:7.5');
    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(LINE_MAX);
      expect(parse(line)['b']).toBe('a1b2');
    });
    const kinds = lines.map((line) => parse(line)['t']);
    expect(kinds).toContain('s');
    expect(kinds).toContain('g');
    expect(kinds).toContain('c');
    expect(kinds).toContain('l');
  });

  it('reports how many lines it dropped when the budget is exceeded', () => {
    const data = emptyWindow();
    for (let screen = 0; screen < 30; screen += 1) {
      commitStat(data, `screen/${String(screen)}`, 'x').add(1, false);
    }
    const lines = encodeWindow(data, META);
    expect(lines).toHaveLength(LINES_MAX);
    expect(parse(lines[0] ?? '')['dl']).toBe(30 - (LINES_MAX - 1));
  });
});
