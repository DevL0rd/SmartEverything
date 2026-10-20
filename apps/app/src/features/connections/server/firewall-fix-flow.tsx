import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  firewallSteps,
  type FirewallApplyResult,
  type FirewallPlan,
  type FirewallStepResult,
} from '@smarteverything/domain';
import { applyFirewall, type SystemPromptApply } from '../../../api/firewall';
import { Badge } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { CodeBlock } from '../../../components/code';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { desktopBridge } from '../../../design/platform';
import { errorText } from '../../../format/errors';
import { useFirewall, useIsOwner } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import { FlowButton } from '../flows/flow-button';
import { leaveFlow } from '../flows/leave-flow';
import { APPLY_NOTICE, STEP_LOOK } from '../model/firewall';
import { connectionsLog } from '../connections-log';

type Phase =
  | {
      readonly kind: 'review';
      readonly result: FirewallApplyResult | null;
      readonly error: string | null;
    }
  | { readonly kind: 'applying' };

const MANUAL_OUTCOMES: ReadonlySet<FirewallApplyResult['outcome']> = new Set([
  'unavailable',
  'failed',
  'partial',
]);

function useApply(systemPrompt: SystemPromptApply | null): {
  readonly phase: Phase;
  readonly apply: (plan: FirewallPlan) => void;
} {
  const store = useEntityStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'review', result: null, error: null });
  const apply = (plan: FirewallPlan): void => {
    setPhase({ kind: 'applying' });
    connectionsLog.info('firewall.apply_started', { revision: plan.revision });
    applyFirewall(store, systemPrompt, plan.revision).then(
      (result) => {
        connectionsLog.info('firewall.apply_finished', {
          outcome: result.outcome,
          via: result.via,
        });
        setPhase({ kind: 'review', result, error: null });
      },
      (error: unknown) => {
        connectionsLog.error('firewall.apply_failed', error, { revision: plan.revision });
        setPhase({ kind: 'review', result: null, error: errorText(error).detail });
      },
    );
  };
  return { phase, apply };
}

function StepRows({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly FirewallStepResult[];
}): ReactNode {
  return (
    <List inset title={title}>
      {rows.map((row) => (
        <ListRow
          key={row.command}
          icon="shield"
          title={row.label}
          {...(row.detail === '' ? {} : { subtitle: row.detail })}
          wrapSubtitle
          trailing={
            <Badge label={STEP_LOOK[row.outcome].label} tone={STEP_LOOK[row.outcome].tone} />
          }
        />
      ))}
    </List>
  );
}

function PlannedRows({ plan }: { readonly plan: FirewallPlan }): ReactNode {
  return (
    <List inset title="What will be added">
      {firewallSteps(plan).map((step) => (
        <ListRow key={step.command} icon="shield" title={step.label} wrapSubtitle />
      ))}
    </List>
  );
}

function ResultView({ result }: { readonly result: FirewallApplyResult }): ReactNode {
  const notice = APPLY_NOTICE[result.outcome];
  return (
    <View className="gap-4">
      <Banner tone={notice.tone} title={notice.title} body={result.detail} wrapBody />
      {result.steps.length === 0 ? null : <StepRows title="Result" rows={result.steps} />}
      {MANUAL_OUTCOMES.has(result.outcome) && result.commands !== '' ? (
        <View className="gap-2">
          <Text variant="body">Run these on the computer that runs your server:</Text>
          <CodeBlock label="Commands" code={result.commands} />
        </View>
      ) : null}
    </View>
  );
}

function Review({
  plan,
  phase,
  elevates,
}: {
  readonly plan: FirewallPlan;
  readonly phase: Phase;
  readonly elevates: boolean;
}): ReactNode {
  return (
    <View className="gap-4">
      {phase.kind === 'review' && phase.error !== null ? (
        <Banner tone="critical" title="The rules weren’t added" body={phase.error} wrapBody />
      ) : null}
      {phase.kind === 'review' && phase.result !== null ? (
        <ResultView result={phase.result} />
      ) : null}
      <Text variant="body">
        {elevates
          ? 'Your server adds these with sudo. If it can’t, your computer asks for your password.'
          : 'Your server adds these with sudo. If it can’t, you get the commands to run yourself.'}
      </Text>
      <PlannedRows plan={plan} />
      {phase.kind === 'applying' ? (
        <Text variant="callout" tone="primary">
          Adding the rules…
        </Text>
      ) : null}
    </View>
  );
}

function Finished({ result }: { readonly result: FirewallApplyResult | null }): ReactNode {
  return (
    <FlowFrame
      title="Fix the firewall"
      onCancel={leaveFlow}
      footer={<FlowButton label="Done" onPress={leaveFlow} />}
    >
      {result === null ? (
        <EmptyState
          icon="circleCheck"
          title="Nothing to fix"
          body="Cameras and devices can reach your server."
        />
      ) : (
        <ResultView result={result} />
      )}
    </FlowFrame>
  );
}

export function FirewallFixFlow(): ReactNode {
  const bridge = desktopBridge();
  const owner = useIsOwner();
  const plan = useFirewall()?.plan ?? null;
  const { phase, apply } = useApply(
    bridge === null
      ? null
      : (revision): Promise<FirewallApplyResult> => bridge.applyFirewall(revision),
  );
  if (!owner) {
    return (
      <FlowFrame
        title="Fix the firewall"
        onCancel={leaveFlow}
        footer={<FlowButton label="Close" onPress={leaveFlow} />}
      >
        <EmptyState
          icon="shield"
          title="Only the owner can change the firewall"
          body="Ask the owner of this home to fix it."
        />
      </FlowFrame>
    );
  }
  if (plan === null) {
    return <Finished result={phase.kind === 'review' ? phase.result : null} />;
  }
  return (
    <FlowFrame
      title="Fix the firewall"
      onCancel={leaveFlow}
      wide
      footer={
        <FlowButton
          label="Fix"
          icon="shield"
          loading={phase.kind === 'applying'}
          onPress={() => {
            apply(plan);
          }}
        />
      }
    >
      <Review plan={plan} phase={phase} elevates={bridge !== null} />
    </FlowFrame>
  );
}
