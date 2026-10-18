import { describe, expect, it } from 'vitest';
import type {
  AiHarnessSession,
  AiHarnessSwitchResult,
  AiHarnessTarget,
} from '@smarteverything/domain';
import { machineSwitchNotice, machineSwitchOf, machineSwitchRequest } from './harness-handoff';

const SERVER: AiHarnessTarget = { kind: 'server' };
const STUDIO: AiHarnessTarget = { kind: 'device', device_id: 'studio' };

const route = { id: 'r1', capability_revision: 'rev-2' };

function engine(target: AiHarnessTarget): {
  readonly execution_target: AiHarnessTarget;
  readonly model: string;
  readonly effort: null;
} {
  return { execution_target: target, model: 'm1', effort: null };
}

function session(target: AiHarnessTarget): {
  readonly target: AiHarnessTarget;
  readonly directory: AiHarnessSession['directory'];
} {
  return { target, directory: { target, path: '/work' } };
}

function result(state: AiHarnessSwitchResult['state']): AiHarnessSwitchResult {
  return { state, execution_target: SERVER, pending_execution_target: null };
}

describe('machineSwitchOf', () => {
  it('is idle without a pending target and pending with one', () => {
    expect(machineSwitchOf(null)).toEqual({ kind: 'idle' });
    expect(machineSwitchOf(undefined)).toEqual({ kind: 'idle' });
    expect(machineSwitchOf(STUDIO)).toEqual({ kind: 'pending', target: STUDIO });
  });
});

describe('machineSwitchRequest', () => {
  const base = { route, operationId: 'op-1' };

  it('asks for the picked machine without mode or epoch', () => {
    const request = machineSwitchRequest({ ...base, engine: engine(STUDIO), session: undefined });
    expect(request).toEqual({
      operation_id: 'op-1',
      target: STUDIO,
      route: { route_id: 'r1', capability_revision: 'rev-2', model: 'm1', effort: null },
    });
  });

  it('keeps the folder only when the machine stays the same (cancel)', () => {
    expect(
      machineSwitchRequest({ ...base, engine: engine(SERVER), session: session(SERVER) }).directory,
    ).toEqual({ target: SERVER, path: '/work' });
    expect(
      machineSwitchRequest({ ...base, engine: engine(STUDIO), session: session(SERVER) }).directory,
    ).toBeUndefined();
  });
});

describe('machineSwitchNotice', () => {
  it('says "Now on" only when the switch applied', () => {
    expect(machineSwitchNotice(result('applied'), 'Studio')).toEqual({ message: 'Now on Studio' });
    expect(machineSwitchNotice(result('pending'), 'Studio')).toBeNull();
    expect(machineSwitchNotice(result('cleared'), 'Studio')).toBeNull();
  });
});
