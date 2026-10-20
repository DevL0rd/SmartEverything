import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_ENDPOINTS as E,
  FIREWALL_STATUS,
  type FirewallApplyResult,
  type FirewallStatus,
} from '@smarteverything/domain';

const call = vi.hoisted(() => vi.fn());

vi.mock('./transport', () => ({ api: (): unknown => ({ call }) }));

import { EntityStore } from '../store/entity-store';
import { applyFirewall } from './firewall';

const REVISION = '0123456789abcdef';

function statusOf(detail: string): FirewallStatus {
  return FIREWALL_STATUS.parse({
    checkedAt: '2026-10-18T12:00:00.000Z',
    backend: 'ufw',
    filtering: true,
    detail,
    openings: [],
    plan: null,
    cameras: [],
  });
}

function resultOf(
  outcome: FirewallApplyResult['outcome'],
  via: FirewallApplyResult['via'],
  detail: string,
): FirewallApplyResult {
  return { outcome, via, steps: [], detail, commands: '', status: statusOf(detail) };
}

describe('applyFirewall', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('asks the server first and shows the status it returns', async () => {
    call.mockResolvedValue(resultOf('applied', 'sudo', 'from the server'));
    const store = new EntityStore();
    const result = await applyFirewall(store, null, REVISION);
    expect(call).toHaveBeenCalledWith(E.applyFirewall, { body: { revision: REVISION } });
    expect(result.via).toBe('sudo');
    expect(store.get().firewall?.detail).toBe('from the server');
  });

  it('falls back to the desktop window when the server cannot elevate', async () => {
    call.mockResolvedValue(resultOf('unavailable', null, 'sudo needs a password'));
    const bridge = vi.fn().mockResolvedValue(resultOf('applied', 'desktop', 'from the prompt'));
    const store = new EntityStore();
    const result = await applyFirewall(store, bridge, REVISION);
    expect(bridge).toHaveBeenCalledWith(REVISION);
    expect(result.via).toBe('desktop');
    expect(store.get().firewall?.detail).toBe('from the prompt');
  });

  it('keeps the server answer and its commands on a phone that has no desktop window', async () => {
    call.mockResolvedValue(resultOf('unavailable', null, 'sudo needs a password'));
    const store = new EntityStore();
    const result = await applyFirewall(store, null, REVISION);
    expect(result.outcome).toBe('unavailable');
    expect(store.get().firewall?.detail).toBe('sudo needs a password');
  });

  it('never opens the system prompt when the server already applied or failed', async () => {
    call.mockResolvedValue(resultOf('failed', 'sudo', 'ufw said no'));
    const bridge = vi.fn();
    await applyFirewall(new EntityStore(), bridge, REVISION);
    expect(bridge).not.toHaveBeenCalled();
  });
});
