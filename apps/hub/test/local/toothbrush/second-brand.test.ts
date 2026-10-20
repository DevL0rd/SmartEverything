import {
  ORALB_CHARACTERISTICS,
  ORALB_IDENTITY,
  ORALB_RULES,
  oralbProfileOf,
  type BrushFrame,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { sonicareBrand } from '../../../src/local/sonicare/brand';
import type {
  BrandItem,
  BrandRuntime,
  BrandValues,
  BrushBrand,
  BrushSnapshot,
} from '../../../src/local/toothbrush/brand';
import { identityOf, lastState, sonicareRig, type SonicareRig } from '../../support/sonicare-rig';

const IDENTITY = ORALB_IDENTITY.parse({
  address: 'A0:14:3D:11:22:33',
  advertAddress: 'A0:14:3D:11:22:33',
  protocol: 8,
  modelId: 0x36,
  firmware: 82,
  gapName: 'Oral-B Toothbrush',
  services: [],
  present: [...ORALB_CHARACTERISTICS],
  ff05Length: 8,
  ff05Runtime: null,
  ff0bLength: 10,
  ff2bLength: 4,
  ff2dLength: 5,
  advertHex: '083652083200000500010 0'.replaceAll(' ', ''),
  clock: 1_790_000_000,
});

function snapshotOf(
  before: BrushSnapshot,
  input: { brushing: boolean; elapsed: number; force: number; hint: number },
): BrushSnapshot {
  const { brushing } = input;
  return {
    ...before,
    activity: brushing ? 'brushing' : 'standby',
    elapsedS: input.elapsed,
    force: brushing ? input.force / 10 : null,
    angleDeg: brushing ? 12 : null,
    face: brushing ? 3 : null,
    zoneSeconds: brushing ? [10, 10, 10, 0] : [],
    sectorS: brushing ? 4 : null,
    endHint: input.hint === 1 ? 'complete' : null,
  };
}

class StubRuntime implements BrandRuntime {
  readonly profile = oralbProfileOf(IDENTITY, [30, 30, 30, 30]);
  readonly transferring = false;
  snapshot: BrushSnapshot = {
    activity: 'standby',
    elapsedS: 0,
    routineS: 120,
    mode: 'daily_clean',
    intensity: null,
    pressure: null,
    pressureValue: null,
    temperatureC: null,
    zone: null,
    zoneSeconds: [],
    sectorS: null,
    force: null,
    angleDeg: null,
    face: null,
    battery: 80,
    batteryMillivolts: null,
    sessionId: null,
    head: { serial: null, type: null, usageS: null, limitS: null },
    endHint: null,
    faults: null,
    liveSource: 'advert',
  };

  *decode(frames: readonly BrushFrame[]): Iterable<BrandItem> {
    for (const frame of frames) {
      const [activity = 0, elapsed = 0, force = 0, hint = 0] = Buffer.from(frame.hex, 'hex');
      this.snapshot = snapshotOf(this.snapshot, { brushing: activity === 1, elapsed, force, hint });
      yield {
        kind: 'state',
        at: frame.at,
        touched: new Set(['activity', 'elapsed', 'battery']),
      };
    }
  }

  readonly calls: string[] = [];

  reset(): void {
    this.calls.push('reset');
  }

  wake(): void {
    this.calls.push('wake');
  }

  sleep(): boolean {
    return false;
  }

  clearPressure(): void {
    this.calls.push('clearPressure');
  }

  observed(): Record<string, never> {
    return {};
  }

  fetch(): ReturnType<BrandRuntime['fetch']> {
    return { fetch: [], transfer: null };
  }

  command(): never {
    throw new Error('the stub takes no commands');
  }

  values(): BrandValues {
    return {
      entries: [['battery', 80]],
      metrics: [['brush_battery_mv', 4000]],
      events: [],
    };
  }

  headView(): never {
    throw new Error('the stub has no head view');
  }

  handleView(): never {
    throw new Error('the stub has no handle view');
  }

  headTimeline(): never {
    throw new Error('the stub has no head timeline');
  }

  diagnostics(): never {
    throw new Error('the stub has no diagnostics');
  }
}

const STUB_BRAND: BrushBrand = {
  ...sonicareBrand,
  brand: 'oralb',
  rules: ORALB_RULES,
  runtime: () => new StubRuntime(),
};

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

function hex(...bytes: number[]): string {
  return Buffer.from(bytes).toString('hex');
}

describe('a brand that times its zones and measures force', () => {
  it('keeps the zones, the face and the force in the stored session and hides them from a member', async () => {
    const brushed = await sonicareRig(identityOf(), {}, 'owner', STUB_BRAND);
    rig = brushed;
    brushed.watched.value = true;
    brushed.batch(0, [brushed.frame('ff0b', hex(0, 0, 0, 0), 0)]);
    for (let second = 1; second <= 30; second += 1) {
      brushed.batch(second, [brushed.frame('ff0b', hex(1, second, 25, 0), second)]);
    }
    const live = brushed.notices.at(-1)?.notices;
    expect(live?.[0]?.frame).toMatchObject({
      zoneSource: 'pacer',
      zoneSeconds: [10, 10, 10, 0],
      sectorS: 4,
      force: 2.5,
      angleDeg: 12,
      face: 3,
      liveSource: 'advert',
    });
    expect(live?.[1]?.frame).toMatchObject({
      zoneSeconds: [10, 10, 10, 0],
      sectorS: 4,
      force: null,
      angleDeg: null,
      face: null,
      detailVisible: false,
    });
    brushed.batch(31, [brushed.frame('ff0b', hex(0, 30, 0, 1), 31)]);
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session).toMatchObject({
      durationS: 30,
      complete: true,
      zones: [10, 10, 10, 0],
      details: { zoneSource: 'pacer', face: 3, sectors: 4, batteryEnd: 80, handleUser: null },
      pressure: { forceAvgN: 2.5, forceMaxN: 2.5 },
    });
    expect(lastState(brushed, 'battery')).toBe(80);
    expect(brushed.pushed).toContainEqual({ capability: 'brush_battery_mv', value: 4000 });
  });
});
