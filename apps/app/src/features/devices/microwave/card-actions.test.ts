import { MICROWAVE_REASONS } from '@smarteverything/domain';
import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import { FAMILY_CONTROLS } from '../controls/family-controls';
import { OFFLINE_LINE } from './card-model';
import { cardActions } from './card-actions';
import { MicrowaveQuick, MicrowaveTile, MicrowaveCooking } from './cooking';
import { OperatingButtons } from './operating-buttons';
import type { QuickChoice } from './quick-model';
import type { MicrowaveQuick as QuickState } from './use-quick';

const DEVICE = deviceFixture(0);
const BLOCKED: QuickState = {
  state: { kind: 'blocked', reason: MICROWAVE_REASONS.remoteOff },
  busy: false,
  send: (_choice: QuickChoice) => Promise.resolve(),
};

function props(node: ReactNode): Readonly<Record<string, unknown>> {
  return isValidElement(node) && typeof node.props === 'object' && node.props !== null
    ? Object.fromEntries(Object.entries(node.props))
    : {};
}

function typeOf(node: ReactNode): unknown {
  return isValidElement(node) ? node.type : null;
}

describe('microwave card actions', () => {
  it.each(['running', 'paused'] as const)('offers pause or resume and stop while %s', (phase) => {
    const [only] = cardActions({ device: DEVICE, run: { phase }, quick: BLOCKED });
    expect(typeOf(only)).toBe(OperatingButtons);
  });

  it('says the reason once instead of buttons for an open door, an offline microwave and remote off', () => {
    const door = cardActions({ device: DEVICE, run: { phase: 'door_open' }, quick: BLOCKED });
    expect(props(door[0])['text']).toBe(MICROWAVE_REASONS.doorOpen);
    const offline = cardActions({ device: DEVICE, run: { phase: 'offline' }, quick: BLOCKED });
    expect(props(offline[0])['text']).toBe(OFFLINE_LINE);
    const remote = cardActions({ device: DEVICE, run: { phase: 'idle' }, quick: BLOCKED });
    expect(props(remote[0])['text']).toBe(MICROWAVE_REASONS.remoteOff);
  });

  it('shows only the main control on a tile, so it fits and is never cut off', () => {
    const [tile] = cardActions({
      device: DEVICE,
      run: { phase: 'running' },
      quick: BLOCKED,
      compact: true,
    });
    expect(typeOf(tile)).toBe(OperatingButtons);
    expect(props(tile)['primaryOnly']).toBe(true);
    const [full] = cardActions({ device: DEVICE, run: { phase: 'running' }, quick: BLOCKED });
    expect(props(full)['primaryOnly']).toBe(false);
  });
});

describe('microwave surfaces', () => {
  it('gives the quick sheet its own body with the stop controls, apart from the cooking panel', () => {
    const controls = FAMILY_CONTROLS.microwave;
    expect(controls?.quick).toBe(MicrowaveQuick);
    expect(controls?.primary).toBe(MicrowaveCooking);
    expect(controls?.card).toBe(MicrowaveTile);
  });
});
