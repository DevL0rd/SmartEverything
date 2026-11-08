import { MODEL_SPEC, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SAMSUNG_G9_OLED_49_MODEL as G9 } from '../../src/models/screens-2';

function pathOf(id: string): readonly { readonly x: number; readonly y: number }[] {
  const geometry = G9.parts.find((part) => part.id === id)?.geometry;
  if (geometry?.type !== 'extrude') throw new Error(`${id} is not an extrusion`);
  return geometry.path.map(({ x, y }) => ({ x, y }));
}

describe('Samsung Odyssey OLED G9 49 model', () => {
  it('is a valid spec whose channels, shots and states use known signals', () => {
    expect(MODEL_SPEC.safeParse(G9).success).toBe(true);
    expect(specSignalProblems(G9)).toEqual([]);
  });

  it('matches the published outer size and the live model string', () => {
    expect(G9.footprint).toEqual({ width: 1.1947, depth: 0.2369, height: 0.5293 });
    expect(G9.meta?.aliases).toEqual(['LS49CG954SEXXT']);
  });

  it('curves the panel on a 1800R arc whose chord is the published width', () => {
    const xs = pathOf('panel').map((point) => point.x);
    const chord = Math.max(...xs) - Math.min(...xs);
    expect(chord).toBeGreaterThan(1.18);
    expect(chord).toBeLessThan(1.2);
    const ys = pathOf('screen').map((point) => point.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);
  });

  it('keeps the screen anchor and the picture glows on the screen', () => {
    const anchor = G9.anchors?.find((entry) => entry.kind === 'screen');
    expect(anchor).toMatchObject({ id: 'picture' });
    const glows = G9.parts.filter((part) => part.geometry.type === 'glow');
    expect(glows.length).toBeGreaterThanOrEqual(3);
    expect(glows.every((part) => part.material === 'accent')).toBe(true);
  });

  it('lights the rear ring and the screen only while the screen is on', () => {
    const lit = G9.channels?.find((channel) => channel.id === 'screenLit');
    expect(lit?.map).toMatchObject({ type: 'enum', table: { true: 0.9, false: 0 } });
    const core = G9.channels?.filter((channel) => channel.target === 'coreRing') ?? [];
    expect(core.length).toBeGreaterThan(0);
    expect(core.every((channel) => channel.source !== 'brightness')).toBe(true);
  });
});
