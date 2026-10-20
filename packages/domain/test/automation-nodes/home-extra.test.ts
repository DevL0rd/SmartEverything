import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY } from '../../src/automation-nodes';
import {
  DEVICE_EXTRA_KINDS,
  DEFAULT_SNAPSHOT_CONTROLS,
} from '../../src/automation-nodes/devices-extra';
import { STATE_EXTRA_KINDS } from '../../src/automation-nodes/state-extra';
import { STATE_TIMING_KINDS } from '../../src/automation-nodes/state-timing';
import { STATEFUL_KIND_IDS } from '../../src/automation-v3/structure-rules';

const IDS = [
  'device.ensure',
  'device.fade',
  'device.snapshot',
  'device.restore',
  'device.ir_send',
  'scene.capture',
  'timing.debounce',
  'timing.rate_limit',
  'timing.quiet_hours',
  'state.counter',
  'state.timer',
  'state.machine',
  'state.window_stats',
  'state.compare_past',
];

const kinds = [...DEVICE_EXTRA_KINDS, ...STATE_TIMING_KINDS, ...STATE_EXTRA_KINDS];

describe('v1.1 device and state kinds', () => {
  it('are registered once, and every kind ships', () => {
    expect(kinds.map((kind) => kind.id).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const shipped = id.startsWith('state.') || id.startsWith('timing.');
      expect(NODE_REGISTRY.get(id)?.tier).toBe(shipped ? 'v1' : 'v1.1');
      expect(NODE_REGISTRY.shipped().some((kind) => kind.id === id)).toBe(true);
    }
  });

  it('declare effect classes where they change the world', () => {
    const effects = kinds.filter((kind) => kind.class === 'effect').map((kind) => kind.id);
    expect(effects.sort()).toEqual([
      'device.ensure',
      'device.fade',
      'device.ir_send',
      'device.restore',
      'scene.capture',
    ]);
    expect(NODE_REGISTRY.get('device.ir_send')?.effect).toEqual({
      retry: 'relative',
      budget: 'effects',
    });
    expect(NODE_REGISTRY.get('device.ensure')?.effect?.retry).toBe('idempotent');
  });

  it('read nodes subscribe to what they read and have no exits', () => {
    for (const id of ['device.snapshot', 'state.window_stats', 'state.compare_past']) {
      const kind = NODE_REGISTRY.get(id);
      expect(kind?.class).toBe('read');
      expect(kind?.exits).toEqual([]);
      expect(kind?.reads?.({})).not.toEqual([]);
    }
  });

  it('keep memory exactly where the structure rules expect it', () => {
    const stateful = kinds.filter((kind) => kind.stateful === true).map((kind) => kind.id);
    expect(stateful.sort()).toEqual([
      'state.counter',
      'state.machine',
      'state.timer',
      'timing.debounce',
      'timing.quiet_hours',
      'timing.rate_limit',
    ]);
    for (const id of stateful) expect(STATEFUL_KIND_IDS.has(id)).toBe(true);
  });

  it('route rate limit and quiet hours through their own exits', () => {
    expect(NODE_REGISTRY.get('timing.rate_limit')?.exits).toEqual(['pass', 'dropped']);
    expect(NODE_REGISTRY.get('timing.quiet_hours')?.exits).toEqual(['pass', 'held']);
  });

  it('remember the lighting controls by default', () => {
    const controls = NODE_REGISTRY.get('device.snapshot')?.inputs.find(
      (port) => port.name === 'controls',
    );
    expect(controls?.default).toEqual([...DEFAULT_SNAPSHOT_CONTROLS]);
  });
});
