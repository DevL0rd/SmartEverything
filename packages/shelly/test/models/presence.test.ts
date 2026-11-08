import {
  MODEL_SPEC,
  modelParamValues,
  shownParts,
  specSignalProblems,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SHELLY_PRESENCE_GEN4_MODEL } from '../../src/models/presence';

const ids = (mount: number): string[] =>
  shownParts(
    SHELLY_PRESENCE_GEN4_MODEL,
    2,
    modelParamValues(SHELLY_PRESENCE_GEN4_MODEL, { mount }),
  ).map((part) => part.id);

describe('Shelly Presence Gen4 model mount', () => {
  it('is a valid spec with a stand or wall mount param', () => {
    expect(MODEL_SPEC.safeParse(SHELLY_PRESENCE_GEN4_MODEL).success).toBe(true);
    expect(SHELLY_PRESENCE_GEN4_MODEL.params?.['mount']?.default).toBe(0);
  });

  it('shows the weighted stand only on the stand mount', () => {
    expect(ids(0)).toEqual(expect.arrayContaining(['foot', 'footRing', 'neck', 'pivot', 'body']));
    expect(ids(1).filter((id) => ['foot', 'footRing', 'neck', 'pivot'].includes(id))).toEqual([]);
    expect(ids(1)).toContain('body');
  });
});

describe('Shelly Presence Gen4 model states', () => {
  const channels = SHELLY_PRESENCE_GEN4_MODEL.channels ?? [];

  it('uses only known signals', () => {
    expect(specSignalProblems(SHELLY_PRESENCE_GEN4_MODEL)).toEqual([]);
  });

  it('shows the radar ring at tile size and has no drawn seam', () => {
    expect(ids(0)).not.toContain('faceSeam');
    const tile = shownParts(
      SHELLY_PRESENCE_GEN4_MODEL,
      0,
      modelParamValues(SHELLY_PRESENCE_GEN4_MODEL),
    ).map((part) => part.id);
    expect(tile).toContain('radar');
  });

  it('brightens the ring with the people count, then pulses it while moving', () => {
    const glow = channels.filter(
      (channel) => channel.target === 'radar' && channel.property === 'emissive',
    );
    expect(glow.map((channel) => channel.id)).toEqual([
      'radarClear',
      'radarCount',
      'motionGlow',
      'radarOffline',
    ]);
    expect(glow[1]?.map).toEqual({ type: 'linear', in: [0, 3], out: [0.2, 1.8], clamp: true });
  });

  it('anchors the people count overlay', () => {
    const anchors = SHELLY_PRESENCE_GEN4_MODEL.anchors ?? [];
    expect(anchors.some((anchor) => anchor.kind === 'label' && anchor.id === 'count')).toBe(true);
  });
});
