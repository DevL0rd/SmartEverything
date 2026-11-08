import { describe, expect, it } from 'vitest';
import { buildModel } from '../../../components/models/three/build-model';
import { framedShot } from '../../../components/models/three/framing';
import { fanSpec } from '../visual/visual-fixture';
import { createShotTracker, shotRig } from './shots';

const spec = fanSpec();
const built = buildModel(spec, { lod: 0 });
const rig = shotRig(built, spec, 'card', 1);
const shot = spec.shots?.[0];
const ON = { speed: 0.5 };

describe('live shots', () => {
  it('eases the camera to the working piece and matches the baked framing when settled', () => {
    const tracker = createShotTracker(0);
    tracker.frame({ rig, spec, signals: {}, reduced: false, nowMs: 0 });
    const start = tracker.frame({ rig, spec, signals: ON, reduced: false, nowMs: 100 });
    expect(start.shotId).toBe('blades');
    expect(start.moving).toBe(true);
    expect(start.pose.distance).toBeCloseTo(rig.framed.distance);
    const settled = tracker.frame({ rig, spec, signals: ON, reduced: false, nowMs: 100 + 400 });
    expect(settled.moving).toBe(false);
    const baked = framedShot(built, spec, {
      view: 'card',
      aspect: 1,
      shot,
      elapsedS: 0.4,
      progress: 1,
    });
    expect(settled.pose.distance).toBeCloseTo(baked.distance);
    expect(settled.pose.yaw).toBeCloseTo(baked.yaw);
  });

  it('eases back to the framing when the device stops', () => {
    const tracker = createShotTracker(0);
    tracker.frame({ rig, spec, signals: ON, reduced: false, nowMs: 0 });
    const leaving = tracker.frame({ rig, spec, signals: {}, reduced: false, nowMs: 50 });
    expect(leaving.shotId).toBeNull();
    expect(leaving.moving).toBe(true);
    const back = tracker.frame({ rig, spec, signals: {}, reduced: false, nowMs: 50 + 400 });
    expect(back.moving).toBe(false);
    expect(back.pose.distance).toBeCloseTo(rig.framed.distance);
  });

  it('cuts to the stillAt pose with reduced motion and never moves', () => {
    const tracker = createShotTracker(0);
    const held = tracker.frame({ rig, spec, signals: ON, reduced: true, nowMs: 10 });
    expect(held).toMatchObject({ shotId: 'blades', moving: false, timeS: shot?.stillAt });
    const later = tracker.frame({ rig, spec, signals: ON, reduced: true, nowMs: 5000 });
    expect(later.pose).toEqual(held.pose);
  });
});
