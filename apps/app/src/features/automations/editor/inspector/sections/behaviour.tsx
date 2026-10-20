import type { ReactNode } from 'react';
import { List } from '../../../../../components/section';
import { SelectRow, SwitchRow } from '../../../../../components/rows';
import type { FlowNode, NodePolicy } from '@smarteverything/domain';
import type { BehaviourView, FailureMode } from './behaviour-model';
import {
  DEFAULT_RETRY,
  FAILURE_MODES,
  TIMEOUT_DEFAULT_MS,
  behaviourView,
  evenedRetry,
  routeLocked,
  routeScopeEdit,
  withAcknowledgement,
  withFailureMode,
  withRetry,
  withTimeout,
} from './behaviour-model';
import { DurationRow } from './duration-row';
import { policyOps } from './edits';
import { RetryFields } from './retry-fields';
import { flowNodeOf } from './node-view';
import type { SectionProps } from './section-types';

function setPolicy(section: SectionProps, policy: NodePolicy | null): void {
  section.actions.apply(policyOps(section.view.key, policy));
}

function chooseMode(section: SectionProps, node: FlowNode, mode: FailureMode): void {
  const policy = withFailureMode(node.policy, mode);
  const rows = routeScopeEdit(node, mode);
  const leaving = node.policy?.onError === 'route';
  section.actions.gesture(() => {
    if (leaving && rows !== null) section.actions.editRows(node.key, [rows]);
    setPolicy(section, policy);
    if (!leaving && rows !== null) section.actions.editRows(node.key, [rows]);
  });
}

function RetryRows({
  behaviour,
  section,
  node,
}: {
  readonly behaviour: BehaviourView;
  readonly section: SectionProps;
  readonly node: FlowNode;
}): ReactNode {
  const { retry } = behaviour;
  if (!behaviour.retryOffered) return null;
  return (
    <>
      {behaviour.needsAcknowledgement ? (
        <SwitchRow
          title="Repeat-safe? I accept repeats"
          subtitle="This step is not safe to repeat on its own. A retry may do it twice."
          value={behaviour.acknowledged}
          disabled={section.env.locked}
          onChange={(accepted) => {
            setPolicy(section, withAcknowledgement(node.policy, accepted));
          }}
        />
      ) : null}
      {behaviour.retryEnabled ? (
        <SwitchRow
          title="Try again if it fails"
          value={behaviour.retry !== undefined}
          disabled={section.env.locked}
          onChange={(on) => {
            setPolicy(section, withRetry(node.policy, on ? DEFAULT_RETRY : null));
          }}
        />
      ) : null}
      {retry === undefined ? null : (
        <RetryFields
          retry={retry}
          disabled={section.env.locked}
          onChange={(change) => {
            setPolicy(section, withRetry(node.policy, evenedRetry(retry, change)));
          }}
        />
      )}
    </>
  );
}

export function Behaviour(section: SectionProps): ReactNode {
  const node = flowNodeOf(section.view);
  const { kind } = section.view;
  if (node === undefined || kind === undefined) return null;
  const behaviour = behaviourView(kind, node.policy);
  return (
    <List title="Behaviour">
      <SelectRow
        title="When it fails"
        value={behaviour.onError}
        disabled={section.env.locked}
        options={FAILURE_MODES.map((mode) => ({
          value: mode.value,
          label: mode.label,
          disabled: mode.value !== 'route' && routeLocked(node),
          ...(mode.value !== 'route' && routeLocked(node)
            ? { description: 'Remove the steps in On error first.' }
            : {}),
        }))}
        onChange={(mode) => {
          chooseMode(section, node, mode);
        }}
      />
      <RetryRows behaviour={behaviour} section={section} node={node} />
      <SwitchRow
        title="Time limit"
        value={behaviour.timeout !== undefined}
        disabled={section.env.locked}
        onChange={(on) => {
          setPolicy(section, withTimeout(node.policy, on ? TIMEOUT_DEFAULT_MS : null));
        }}
      />
      {behaviour.timeout === undefined ? null : (
        <DurationRow
          label="Give up after"
          value={behaviour.timeout}
          fallback={TIMEOUT_DEFAULT_MS}
          onChange={(timeout) => {
            setPolicy(section, withTimeout(node.policy, timeout));
          }}
        />
      )}
    </List>
  );
}
