import { describe, expect, it } from 'vitest';
import type { SetupFacts } from './facts';
import type { SetupItemId } from './items';
import { readinessLine, readinessOf } from './readiness';

const NOTHING: SetupFacts = {
  owner: true,
  homeNamed: false,
  located: false,
  ownerNamed: false,
  firewall: 'missing',
  address: 'none',
  pushConfigured: false,
  people: 1,
  phonePaired: false,
  linkedAccounts: 0,
  devices: 0,
  unroomed: 0,
  assistants: 0,
  fitnessReady: false,
  homeOnly: false,
};

const EVERYTHING: SetupFacts = {
  owner: true,
  homeNamed: true,
  located: true,
  ownerNamed: true,
  firewall: 'open',
  address: 'verified',
  pushConfigured: true,
  people: 3,
  phonePaired: true,
  linkedAccounts: 1,
  devices: 4,
  unroomed: 0,
  assistants: 1,
  fitnessReady: true,
  homeOnly: false,
};

function stateOf(facts: SetupFacts, id: SetupItemId): string | undefined {
  return readinessOf(facts, []).entries.find((entry) => entry.item.id === id)?.state;
}

describe('the setup readiness', () => {
  it('starts with the required items first and counts only required and recommended ones', () => {
    const readiness = readinessOf(NOTHING, []);
    expect(readiness.entries.slice(0, 2).map((entry) => entry.item.id)).toEqual([
      'network.firewall',
      'accounts.linked',
    ]);
    expect(readiness.total).toBe(8);
    expect(readiness.done).toBe(0);
    expect(readiness.ready).toBe(false);
    expect(readiness.next?.item.id).toBe('network.firewall');
  });

  it('is ready when every counted item is done', () => {
    const readiness = readinessOf(EVERYTHING, []);
    expect(readiness.ready).toBe(true);
    expect(readiness.done).toBe(readiness.total);
    expect(readiness.next).toBeNull();
    expect(readinessLine(readiness)).toBe('Everything you set up is working.');
  });

  it('names the next item in the line', () => {
    expect(readinessLine(readinessOf(NOTHING, []))).toBe(
      'Next: Let phones and cameras reach your home',
    );
  });

  it('leaves out a firewall item when the server has no firewall', () => {
    expect(stateOf({ ...EVERYTHING, firewall: 'none' }, 'network.firewall')).toBeUndefined();
  });

  it('leaves out the rooms item while there are no devices and the Fitness item without a profile', () => {
    expect(stateOf({ ...EVERYTHING, devices: 0 }, 'accounts.rooms')).toBeUndefined();
    expect(stateOf({ ...EVERYTHING, fitnessReady: null }, 'fitness.about')).toBeUndefined();
  });

  it('leaves out the remote address item for a home-only choice, so the home can be ready', () => {
    const facts = { ...EVERYTHING, address: 'none', homeOnly: true } as const;
    expect(stateOf(facts, 'network.remote')).toBeUndefined();
    expect(readinessOf(facts, []).ready).toBe(true);
  });

  it('does not count a firewall that has not been checked yet', () => {
    expect(stateOf({ ...NOTHING, firewall: 'unchecked' }, 'network.firewall')).toBeUndefined();
  });

  it('exposes the counted entries the gauge draws', () => {
    const readiness = readinessOf(NOTHING, ['network.firewall']);
    expect(readiness.counted).toHaveLength(readiness.total);
    expect(readiness.counted.every((entry) => entry.item.priority !== 'optional')).toBe(true);
    expect(readiness.counted.some((entry) => entry.state === 'skipped')).toBe(false);
  });

  it('treats an unverified or failing address as not reachable from outside', () => {
    expect(stateOf({ ...EVERYTHING, address: 'unverified' }, 'network.remote')).toBe('todo');
    expect(stateOf({ ...EVERYTHING, address: 'failing' }, 'network.remote')).toBe('todo');
  });

  it('shows a skipped item as skipped and stops counting it', () => {
    const readiness = readinessOf(NOTHING, ['network.firewall']);
    expect(readiness.entries.find((entry) => entry.item.id === 'network.firewall')?.state).toBe(
      'skipped',
    );
    expect(readiness.total).toBe(7);
    expect(readiness.next?.item.id).toBe('accounts.linked');
  });

  it('does not show a skip once the item is done', () => {
    expect(
      readinessOf(EVERYTHING, ['network.firewall']).entries.find(
        (entry) => entry.item.id === 'network.firewall',
      )?.state,
    ).toBe('done');
  });

  it('shows a member only the items that are theirs', () => {
    const ids = readinessOf({ ...NOTHING, owner: false }, []).entries.map((entry) => entry.item.id);
    expect(ids).toEqual(['fitness.about']);
  });
});
