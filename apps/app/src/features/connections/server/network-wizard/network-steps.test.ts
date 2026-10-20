import { describe, expect, it } from 'vitest';
import { networkSteps, openStep, stepAfter, stepBefore } from './network-steps';

const ids = (steps: ReturnType<typeof networkSteps>): readonly string[] =>
  steps.map((step) => step.id);

describe('the network setup steps', () => {
  it('asks about the firewall, then where to reach the home, and ends', () => {
    expect(ids(networkSteps({ firewall: 'missing', address: 'none' }, null))).toEqual([
      'firewall',
      'reach',
      'done',
    ]);
  });

  it('leaves the firewall out when the server has none', () => {
    expect(ids(networkSteps({ firewall: 'none', address: 'none' }, 'home'))).toEqual([
      'reach',
      'done',
    ]);
  });

  it('adds the address and its check only for reaching the home from outside', () => {
    expect(ids(networkSteps({ firewall: 'open', address: 'none' }, 'away'))).toEqual([
      'firewall',
      'reach',
      'address',
      'verify',
      'done',
    ]);
  });

  it('opens on the first step that is not done', () => {
    expect(openStep(networkSteps({ firewall: 'missing', address: 'none' }, null))).toBe('firewall');
    expect(openStep(networkSteps({ firewall: 'open', address: 'none' }, null))).toBe('reach');
    expect(openStep(networkSteps({ firewall: 'open', address: 'none' }, 'away'))).toBe('address');
    expect(openStep(networkSteps({ firewall: 'open', address: 'unverified' }, 'away'))).toBe(
      'verify',
    );
    expect(openStep(networkSteps({ firewall: 'open', address: 'failing' }, 'away'))).toBe('verify');
  });

  it('opens on the last step when everything is done', () => {
    expect(openStep(networkSteps({ firewall: 'open', address: 'verified' }, 'away'))).toBe('done');
    expect(openStep(networkSteps({ firewall: 'open', address: 'none' }, 'home'))).toBe('done');
  });

  it('moves between neighbouring steps and stops at the ends', () => {
    const steps = networkSteps({ firewall: 'open', address: 'none' }, 'away');
    expect(stepAfter(steps, 'reach')).toBe('address');
    expect(stepAfter(steps, 'done')).toBe('done');
    expect(stepBefore(steps, 'address')).toBe('reach');
    expect(stepBefore(steps, 'firewall')).toBeNull();
  });
});
