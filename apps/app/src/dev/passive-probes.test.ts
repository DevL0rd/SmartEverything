import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveFlags } from '../developer/toggles';
import { rawTimers, takeFrameRequests } from './raw-timers';

const SOURCES = ['.', '../perf', '../perf/impl'].map((dir) => join(__dirname, dir));
const ALLOWED = new Set(['raw-timers.ts', 'timer-probe.ts']);

function sourceFiles(): readonly { readonly name: string; readonly text: string }[] {
  return SOURCES.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts'))
      .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') })),
  );
}

describe('passive probes', () => {
  it('never request a frame except through the counted raw timer', () => {
    const offenders = sourceFiles()
      .filter(({ name }) => !ALLOWED.has(name))
      .filter(({ text }) => /useFrameCallback|(?<![.\w])requestAnimationFrame\(/.test(text))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('counts frames the probes request and resets the count each window', () => {
    takeFrameRequests();
    expect(takeFrameRequests()).toBe(0);
    expect(typeof rawTimers.requestAnimationFrame).toBe('function');
  });

  it('turns every performance flag off while developer mode is off', () => {
    const off = resolveFlags({ 'perf.sampling': true, 'perf.frames': true }, false);
    expect(Object.entries(off).filter(([id, on]) => id.startsWith('perf.') && on)).toEqual([]);
    const on = resolveFlags({ 'perf.sampling': true, 'perf.stalls': true }, true);
    expect(on['perf.frames']).toBe(true);
    expect(on['perf.stalls']).toBe(true);
    expect(on['perf.upload']).toBe(false);
  });
});
