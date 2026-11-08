import type { DeviceCapability } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { useCellEnvironment } from './cell-budget';
import { renderVisualPart, type VisualCase, type VisualRender } from './visual-budget';

const { LaundryVisual } = await import('../device-visuals/visuals/laundry-visual');

const BOOL = { kind: 'boolean' } as const;
const num = (max: number, unit: string): DeviceCapability['value'] => ({
  kind: 'number',
  min: 0,
  max,
  step: 1,
  unit,
});
const choice = (...options: string[]): DeviceCapability['value'] => ({ kind: 'enum', options });

const WASHER: VisualCase = {
  kind: 'appliance',
  model: 'mibx5.washer.f29gl',
  specs: [
    ['power', BOOL],
    ['raw:2.2', choice('Idle', 'Paused', 'Busy', 'Delay', 'Completed', 'Off')],
    ['raw:2.11', choice('Not Run', 'Washing', 'Rinsing', 'Spinning', 'Drying')],
    ['raw:2.10', num(900, 'min')],
    ['raw:2.9', choice('Open', 'Closed And Can Be Opened', 'Closed And Can Not Be Opened')],
    ['raw:2.7', choice('800', '1200', '1400')],
    ['raw:2.4', choice('No Faults', 'Door Lock Malfunction')],
  ],
};

type WasherValues = Readonly<Record<string, number | boolean | string>>;

const WASHER_BASE: WasherValues = {
  power: true,
  'raw:2.4': 'No Faults',
  'raw:2.9': 'Closed And Can Not Be Opened',
  'raw:2.10': 72,
  'raw:2.7': '1400',
};

const BUSY: WasherValues = { 'raw:2.2': 'Busy' };

const WASHER_STATES: Readonly<Record<string, WasherValues>> = {
  off: { power: false, 'raw:2.2': 'Off' },
  ready: { 'raw:2.2': 'Idle' },
  open: { 'raw:2.2': 'Idle', 'raw:2.9': 'Open' },
  delayed: { 'raw:2.2': 'Delay' },
  weighing: { ...BUSY, 'raw:2.11': 'Weighing' },
  washing: { ...BUSY, 'raw:2.11': 'Washing' },
  soaking: { ...BUSY, 'raw:2.11': 'Soaking' },
  rinsing: { ...BUSY, 'raw:2.11': 'Rinsing' },
  spinning: { ...BUSY, 'raw:2.11': 'Spinning' },
  drying: { ...BUSY, 'raw:2.11': 'Drying' },
  steaming: { ...BUSY, 'raw:2.11': 'Steam Sterilization' },
  paused: { 'raw:2.2': 'Paused', 'raw:2.11': 'Rinsing' },
  finished: { 'raw:2.2': 'Completed' },
  fault: { ...BUSY, 'raw:2.11': 'Rinsing', 'raw:2.4': 'Door Lock Malfunction' },
};

const VISUAL_SIZES = [
  ['tile', 48, 40],
  ['card', 96, 60],
  ['hero', 220, 90],
] as const;

function washerVisual(state: string, size: 'tile' | 'card' | 'hero', px: number): VisualRender {
  return renderVisualPart(LaundryVisual, {
    visual: WASHER,
    values: { ...WASHER_BASE, ...WASHER_STATES[state] },
    size,
    px,
  });
}

describe('laundry visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of VISUAL_SIZES) {
    it(`stays within ${String(limit)} nodes at ${size} size in every state`, () => {
      for (const state of Object.keys(WASHER_STATES)) {
        const { count } = washerVisual(state, size, px);
        expect(count, `${state} ${size}`).toBeLessThanOrEqual(limit);
      }
    });
  }

  for (const state of Object.keys(WASHER_STATES)) {
    it(`draws the ${state} card`, async () => {
      const { tree } = washerVisual(state, 'card', 96);
      await expect(tree).toMatchFileSnapshot(`__snapshots__/laundry-visual/${state}-card.txt`);
    });
  }

  it('mounts no sparkle, spin blur or particles for a finished machine', () => {
    const { tree } = washerVisual('finished', 'hero', 220);
    expect(tree).not.toContain('M0-4L1-1L4 0');
    expect(tree).not.toContain('strokeDasharray');
  });

  it('mounts the spin blur only while spinning', () => {
    expect(washerVisual('spinning', 'card', 96).tree).toContain('strokeDasharray');
    expect(washerVisual('washing', 'card', 96).tree).not.toContain('strokeDasharray');
  });

  it('draws no water in the tile', () => {
    expect(washerVisual('washing', 'tile', 48).tree).not.toContain('transitionProperty');
  });
});
