import { ERROR_EXIT_PORT, NODE_REGISTRY } from '@smarteverything/domain';
import type { FlowNode, NodeKind } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { errorExitFindings, errorExitKinds } from '../../src/check/lint-error-exit';
import { automation, make, scope, wired } from '../compile/support';
import { findings, lintContext, only } from './lint-support';

function withConfirmed(kind: NodeKind | undefined): NodeKind | undefined {
  if (kind?.id !== 'device.set') return kind;
  const confirmed = {
    name: 'confirmed',
    type: { t: 'boolean' },
    waitOnly: true,
    description: 'Whether the device confirmed it.',
  } as const;
  return { ...kind, outputs: [...kind.outputs, confirmed] };
}

const lookup = (id: string): NodeKind | undefined => withConfirmed(NODE_REGISTRY.get(id));

const kinds = errorExitKinds(lookup);

const handler = scope(make('note', 'flow.stop'));

function codes(nodes: FlowNode[]): string[] {
  return errorExitFindings(automation(nodes), kinds).map((found) => found.code);
}

describe('error exit lint', () => {
  it('flags an error exit wired on a kind that cannot fail', () => {
    const pure = make('m', 'math.add', {}, { scopes: { [ERROR_EXIT_PORT]: handler } });
    const [found] = errorExitFindings(automation([pure]), kinds);
    expect(found).toMatchObject({
      severity: 'error',
      code: 'error_exit_not_fallible',
      key: 'm',
      port: ERROR_EXIT_PORT,
    });
  });

  it('accepts an error exit on a fallible kind and an unknown kind', () => {
    const effect = make('s', 'device.set', {}, { scopes: { [ERROR_EXIT_PORT]: handler } });
    const unknown = make('u', 'plugin.gone', {}, { scopes: { [ERROR_EXIT_PORT]: handler } });
    expect(codes([effect, unknown])).toEqual([]);
  });

  it('flags a wait-only output used from a node that sends and continues, with a switch to wait', () => {
    const sender = make('s', 'device.set', {}, { policy: { mode: 'fire_and_forget' } });
    const user = make('n', 'notify.person', { body: wired('s.confirmed') });
    const [found] = errorExitFindings(automation([sender, user]), kinds);
    expect(found).toMatchObject({
      code: 'wait_only_in_send',
      key: 'n',
      received: 's.confirmed',
      fix: { action: { action: 'set_run_mode', key: 's', mode: 'wait_for_result' } },
    });
  });

  it('accepts the same output once the node waits for the result', () => {
    const waiting = make('s', 'device.set', {}, { policy: { mode: 'wait_for_result' } });
    const user = make('n', 'notify.person', { body: wired('s.confirmed') });
    expect(codes([waiting, user])).toEqual([]);
  });

  it('ignores outputs that a sending node always gives', () => {
    const sender = make('s', 'device.set', {}, { policy: { mode: 'fire_and_forget' } });
    const user = make('n', 'notify.person', { body: wired('s.error') });
    expect(codes([sender, user])).toEqual([]);
  });

  it('reaches the user through lint with the kinds of the lint context', () => {
    const pure = make('m', 'math.add', {}, { scopes: { [ERROR_EXIT_PORT]: handler } });
    const found = findings(automation([pure]));
    expect(only(found, 'error_exit_not_fallible')).toMatchObject([
      { severity: 'error', key: 'm', port: ERROR_EXIT_PORT },
    ]);
    const context = lintContext();
    expect(errorExitKinds(context.kinds).fallible('device.set')).toBe(true);
  });
});
