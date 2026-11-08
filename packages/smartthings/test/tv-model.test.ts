import { MODEL_SPEC, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SAMSUNG_S95B_65_MODEL as TV } from '../src/models/screens';

const SCREEN = TV.parts.find((part) => part.id === 'screenGlow')?.geometry;

function screenHalf(): readonly [number, number] {
  if (SCREEN?.type !== 'roundedPlane') throw new Error('no screen');
  return [Number(SCREEN.width) / 2, Number(SCREEN.height) / 2];
}

function driftOf(id: string): number {
  const motion = TV.channels?.find((channel) => channel.id === `${id}Drift`)?.motion;
  return motion?.type === 'oscillate' ? Math.max(...motion.limits.map(Math.abs)) : 0;
}

function visibleTables(target: string): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    (TV.channels ?? [])
      .filter((channel) => channel.target === target && channel.property === 'visible')
      .map((channel) => [
        typeof channel.source === 'string' ? channel.source : JSON.stringify(channel.source),
        channel.map.type === 'enum' ? channel.map.table : null,
      ]),
  );
}

describe('Samsung S95B 65 model', () => {
  it('is a valid spec whose channels use known signals', () => {
    expect(MODEL_SPEC.safeParse(TV).success).toBe(true);
    expect(specSignalProblems(TV)).toEqual([]);
  });

  it('paints the picture with smooth glows instead of stacked flat blobs', () => {
    const accents = TV.parts.filter((part) => part.material === 'accent');
    expect(accents.length).toBeGreaterThan(0);
    expect(accents.every((part) => part.geometry.type === 'glow')).toBe(true);
  });

  it('keeps every glow inside the screen while it drifts', () => {
    const [halfWidth, halfHeight] = screenHalf();
    for (const part of TV.parts.filter((entry) => entry.geometry.type === 'glow')) {
      if (part.geometry.type !== 'glow') continue;
      const [x = 0, y = 0] = (part.transform?.position ?? []).map(Number);
      const reach = Number(part.geometry.width) / 2 + Math.abs(x) + driftOf(part.id);
      expect(reach).toBeLessThanOrEqual(halfWidth);
      expect(Number(part.geometry.height) / 2 + Math.abs(y)).toBeLessThanOrEqual(halfHeight);
    }
  });

  it('shows the home row only on the lit home screen', () => {
    expect(visibleTables('homeDock')).toStrictEqual({
      screenOn: { true: 1, false: 0 },
      playing: { true: 0 },
      power: { false: 0 },
      online: { false: 0 },
    });
  });
});
