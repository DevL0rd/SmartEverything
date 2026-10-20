import { describe, expect, it } from 'vitest';
import type { FlowNode, NodeKind } from '@smarteverything/domain';
import { NODE_POLICY, NODE_REGISTRY } from '@smarteverything/domain';
import {
  DEFAULT_RETRY,
  ROUTE_SCOPE,
  behaviourView,
  compactPolicy,
  evenedRetry,
  hasBehaviour,
  routeLocked,
  routeScopeEdit,
  withAcknowledgement,
  withFailureMode,
  withRetry,
  withTimeout,
} from './behaviour-model';

function effectWith(retry: 'idempotent' | 'relative' | 'external'): NodeKind {
  const found = NODE_REGISTRY.kinds.find((kind) => kind.effect?.retry === retry);
  if (found === undefined) throw new Error(`no ${retry} effect in the registry`);
  return found;
}

function stepOf(kind: string, extra: Partial<FlowNode> = {}): FlowNode {
  return { id: '00000000-0000-4000-8000-000000000001', key: 'a', kind, ...extra };
}

describe('which kinds have a Behaviour section', () => {
  it('covers steps that can fail and leaves out values and triggers', () => {
    expect(hasBehaviour(NODE_REGISTRY.get('device.set'))).toBe(true);
    expect(hasBehaviour(NODE_REGISTRY.get('flow.if'))).toBe(true);
    expect(hasBehaviour(NODE_REGISTRY.get('math.add'))).toBe(false);
    expect(hasBehaviour(NODE_REGISTRY.get('trigger.time'))).toBe(false);
    expect(hasBehaviour(undefined)).toBe(false);
  });
});

describe('retry is offered by how safe the step is to repeat', () => {
  it('lets an idempotent effect retry without being asked to accept anything', () => {
    const view = behaviourView(effectWith('idempotent'), undefined);
    expect(view).toMatchObject({
      retryOffered: true,
      needsAcknowledgement: false,
      retryEnabled: true,
    });
  });

  it.each(['relative', 'external'] as const)(
    'holds retry of a %s effect behind the repeat-safe acknowledgement',
    (retry) => {
      const kind = effectWith(retry);
      expect(behaviourView(kind, undefined)).toMatchObject({
        retryOffered: true,
        needsAcknowledgement: true,
        acknowledged: false,
        retryEnabled: false,
      });
      expect(behaviourView(kind, { acknowledgeRepeat: true })).toMatchObject({
        acknowledged: true,
        retryEnabled: true,
      });
    },
  );

  it('never offers retry on a step that is not an effect', () => {
    const view = behaviourView(NODE_REGISTRY.get('flow.if') ?? effectWith('idempotent'), undefined);
    expect(view.retryOffered).toBe(false);
    expect(view.retryEnabled).toBe(false);
  });

  it('shows the stored failure mode and time limit', () => {
    const view = behaviourView(effectWith('idempotent'), { onError: 'route', timeout: 4000 });
    expect(view).toMatchObject({ onError: 'route', timeout: 4000 });
    expect(behaviourView(effectWith('idempotent'), undefined).onError).toBe('fail');
  });
});

describe('policy edits stay valid and tidy', () => {
  it('writes a failure mode and removes the key for the default', () => {
    expect(withFailureMode(undefined, 'continue')).toEqual({ onError: 'continue' });
    expect(withFailureMode({ onError: 'continue' }, 'fail')).toBeNull();
    expect(withFailureMode({ onError: 'route', timeout: 5 }, 'fail')).toEqual({ timeout: 5 });
  });

  it('writes and clears a time limit', () => {
    expect(withTimeout({ onError: 'continue' }, 2000)).toEqual({
      onError: 'continue',
      timeout: 2000,
    });
    expect(withTimeout({ timeout: 2000 }, null)).toBeNull();
  });

  it('writes and clears a retry', () => {
    expect(withRetry(undefined, DEFAULT_RETRY)).toEqual({ retry: DEFAULT_RETRY });
    expect(withRetry({ retry: DEFAULT_RETRY, timeout: 9 }, null)).toEqual({ timeout: 9 });
  });

  it('drops the retry when the acknowledgement is taken back', () => {
    const accepted = withAcknowledgement(undefined, true);
    expect(accepted).toEqual({ acknowledgeRepeat: true });
    const retrying = withRetry(accepted ?? undefined, DEFAULT_RETRY);
    expect(withAcknowledgement(retrying ?? undefined, false)).toBeNull();
  });

  it('turns an empty policy into null', () => {
    expect(compactPolicy({})).toBeNull();
    expect(compactPolicy({ timeout: 1 })).toEqual({ timeout: 1 });
  });

  it('keeps the default retry valid for the policy schema', () => {
    expect(NODE_POLICY.safeParse({ retry: DEFAULT_RETRY }).success).toBe(true);
  });

  it('raises the longest wait when the first wait grows past it', () => {
    expect(evenedRetry(DEFAULT_RETRY, { initial: 60_000 }).max).toBe(60_000);
    expect(evenedRetry(DEFAULT_RETRY, { initial: 2000 }).max).toBe(30_000);
    expect(evenedRetry({ attempts: 2, backoff: 'fixed', initial: 5 }, { attempts: 4 })).toEqual({
      attempts: 4,
      backoff: 'fixed',
      initial: 5,
    });
  });
});

describe('Go to On error', () => {
  it('adds the On error lane when the mode is chosen and removes it when it is left', () => {
    const plain = stepOf('device.set');
    expect(routeScopeEdit(plain, 'route')).toEqual({ t: 'scope.add', name: ROUTE_SCOPE });
    expect(routeScopeEdit(plain, 'continue')).toBeNull();
    const routed = stepOf('device.set', { scopes: { [ROUTE_SCOPE]: { nodes: [] } } });
    expect(routeScopeEdit(routed, 'route')).toBeNull();
    expect(routeScopeEdit(routed, 'fail')).toEqual({ t: 'scope.remove', name: ROUTE_SCOPE });
  });

  it('locks the other modes while the lane still holds steps', () => {
    const empty = stepOf('device.set', { scopes: { [ROUTE_SCOPE]: { nodes: [] } } });
    const busy = stepOf('device.set', {
      scopes: { [ROUTE_SCOPE]: { nodes: [stepOf('device.set')] } },
    });
    expect(routeLocked(empty)).toBe(false);
    expect(routeLocked(busy)).toBe(true);
    expect(routeLocked(stepOf('device.set'))).toBe(false);
  });
});
