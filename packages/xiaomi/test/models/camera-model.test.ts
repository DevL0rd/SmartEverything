import { MODEL_SPEC, shownParts, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { XIAOMI_CAMERA_083AE2_MODEL as CAMERA } from '../../src/models/camera';

const nightTargets = (CAMERA.channels ?? [])
  .filter((channel) => channel.source === 'mode' && channel.map.type === 'enum')
  .filter((channel) => channel.map.type === 'enum' && 'night' in channel.map.table)
  .map((channel) => `${channel.target}.${channel.property}`);

describe('Xiaomi camera 083ae2 model', () => {
  it('is a valid spec whose channels and states use known signals', () => {
    expect(MODEL_SPEC.safeParse(CAMERA).success).toBe(true);
    expect(specSignalProblems(CAMERA)).toEqual([]);
  });

  it('shows night vision as a red infrared ring and a cooler lens', () => {
    expect(nightTargets).toEqual([
      'irRing.colour',
      'irRing.emissive',
      'lens.colour',
      'lens.emissive',
      'infrared.emissive',
    ]);
  });

  it('keeps the infrared ring at tile size', () => {
    expect(shownParts(CAMERA, 0, {}).map((part) => part.id)).toContain('irRing');
  });

  it('patrols at the house framing without zooming in', () => {
    expect(CAMERA.shots?.find((shot) => shot.id === 'patrol')?.zoom).toBe(1);
  });
});
