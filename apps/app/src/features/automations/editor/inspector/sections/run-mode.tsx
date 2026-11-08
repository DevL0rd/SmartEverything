import type { ReactNode } from 'react';
import type { FlowNode, NodeKind } from '@smarteverything/domain';
import { ListRow } from '../../../../../components/list-row';
import { SwitchRow } from '../../../../../components/rows';
import { List } from '../../../../../components/section';
import { TIMEOUT_DEFAULT_MS, withTimeout } from './behaviour-model';
import { DurationRow } from './duration-row';
import { policyOps } from './edits';
import { flowNodeOf } from './node-view';
import { RadioRows } from './radio-rows';
import type { RunModeView } from './run-mode-model';
import { runModeView, withRunMode } from './run-mode-model';
import type { SectionProps } from './section-types';

const TITLE = 'Run mode';

function ModeChoice({
  view,
  kind,
  node,
  section,
}: {
  readonly view: RunModeView;
  readonly kind: NodeKind;
  readonly node: FlowNode;
  readonly section: SectionProps;
}): ReactNode {
  if (view.fixed !== undefined) {
    return (
      <List title={TITLE}>
        <ListRow
          title={view.fixed.title}
          {...(view.reason === undefined ? {} : { subtitle: view.reason, wrapSubtitle: true })}
        />
      </List>
    );
  }
  return (
    <RadioRows
      title={TITLE}
      options={view.choices}
      value={view.mode}
      disabled={section.env.locked}
      onChange={(value) => {
        const picked = view.choices.find((choice) => choice.value === value);
        if (picked === undefined) return;
        section.actions.apply(
          policyOps(section.view.key, withRunMode(kind, node.policy, picked.value)),
        );
      }}
    />
  );
}

function WaitLimit({
  view,
  node,
  section,
}: {
  readonly view: RunModeView;
  readonly node: FlowNode;
  readonly section: SectionProps;
}): ReactNode {
  const set = (timeout: number | null): void => {
    section.actions.apply(policyOps(section.view.key, withTimeout(node.policy, timeout)));
  };
  return (
    <List>
      <SwitchRow
        title="Stop waiting after a while"
        subtitle="When the time runs out the step counts as failed."
        value={view.timeout !== undefined}
        disabled={section.env.locked}
        onChange={(on) => {
          set(on ? TIMEOUT_DEFAULT_MS : null);
        }}
      />
      {view.timeout === undefined ? null : (
        <DurationRow
          label="Give up after"
          value={view.timeout}
          fallback={TIMEOUT_DEFAULT_MS}
          disabled={section.env.locked}
          onChange={set}
        />
      )}
    </List>
  );
}

export function RunMode(section: SectionProps): ReactNode {
  const node = flowNodeOf(section.view);
  const { kind } = section.view;
  if (node === undefined || kind === undefined) return null;
  const view = runModeView(kind, node.policy);
  return (
    <>
      <ModeChoice view={view} kind={kind} node={node} section={section} />
      {view.showsTimeout ? <WaitLimit view={view} node={node} section={section} /> : null}
    </>
  );
}
