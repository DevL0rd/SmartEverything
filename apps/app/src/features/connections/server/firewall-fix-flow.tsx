import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  firewallScript,
  type DesktopFirewallResult,
  type FirewallPlan,
} from '@smarteverything/domain';
import { applyFirewall, checkFirewall } from '../../../api/firewall';
import { Banner } from '../../../components/banner';
import { CodeBlock } from '../../../components/code';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { errorText } from '../../../format/errors';
import { useFirewall } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import { FlowButton } from '../flows/flow-button';
import { leaveFlow } from '../flows/leave-flow';

import { connectionsLog } from '../connections-log';
type Phase =
  | { readonly kind: 'review'; readonly notice: DesktopFirewallResult | null }
  | { readonly kind: 'applying' }
  | { readonly kind: 'applied' };

const NOTICE: Readonly<
  Record<
    DesktopFirewallResult['outcome'],
    { readonly tone: 'warning' | 'critical' | 'info' | 'positive'; readonly title: string }
  >
> = {
  applied: { tone: 'positive', title: 'Firewall fixed' },
  declined: { tone: 'warning', title: 'You cancelled the system prompt' },
  failed: { tone: 'critical', title: 'The rules weren’t added' },
  stale: { tone: 'info', title: 'The rules changed. Review them again.' },
};

function useApply(bridge: DesktopBridge): {
  readonly phase: Phase;
  readonly apply: (plan: FirewallPlan) => void;
} {
  const store = useEntityStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'review', notice: null });
  const apply = (plan: FirewallPlan): void => {
    setPhase({ kind: 'applying' });
    connectionsLog.info('firewall.apply_started', { revision: plan.revision });
    applyFirewall(bridge, plan.revision).then(
      (result) => {
        connectionsLog.info('firewall.apply_finished', { outcome: result.outcome });
        setPhase(
          result.outcome === 'applied' ? { kind: 'applied' } : { kind: 'review', notice: result },
        );
        checkFirewall(store).catch((error: unknown) => {
          connectionsLog.error('firewall.recheck_failed', error);
          notify({ message: 'The firewall wasn’t checked again', error, tone: 'critical' });
        });
      },
      (error: unknown) => {
        connectionsLog.error('firewall.apply_failed', error, { revision: plan.revision });
        setPhase({
          kind: 'review',
          notice: { outcome: 'failed', detail: errorText(error).detail },
        });
      },
    );
  };
  return { phase, apply };
}

function Review({
  plan,
  phase,
}: {
  readonly plan: FirewallPlan;
  readonly phase: Phase;
}): ReactNode {
  const notice = phase.kind === 'review' ? phase.notice : null;
  return (
    <View className="gap-4">
      {notice === null ? null : (
        <Banner
          tone={NOTICE[notice.outcome].tone}
          title={NOTICE[notice.outcome].title}
          {...(notice.detail === '' ? {} : { body: notice.detail })}
        />
      )}
      <Text variant="body">
        These commands will run. Your computer asks for your password first.
      </Text>
      <CodeBlock label="Commands" code={firewallScript(plan).join('\n')} />
      {phase.kind === 'applying' ? (
        <Text variant="callout" tone="primary">
          Approve in the system prompt…
        </Text>
      ) : null}
    </View>
  );
}

function DesktopFix({ bridge }: { readonly bridge: DesktopBridge }): ReactNode {
  const firewall = useFirewall();
  const { phase, apply } = useApply(bridge);
  const plan = firewall?.plan ?? null;
  if (phase.kind === 'applied' || plan === null) {
    return (
      <FlowFrame
        title="Fix the firewall"
        onCancel={leaveFlow}
        footer={<FlowButton label="Done" onPress={leaveFlow} />}
      >
        <EmptyState
          icon="circleCheck"
          title={phase.kind === 'applied' ? 'Firewall fixed' : 'Nothing to fix'}
          body="Cameras and devices can reach your server."
        />
      </FlowFrame>
    );
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
      <Review plan={plan} phase={phase} />
    </FlowFrame>
  );
}

export function FirewallFixFlow(): ReactNode {
  const bridge = desktopBridge();
  if (bridge === null) {
    return (
      <FlowFrame
        title="Fix the firewall"
        onCancel={leaveFlow}
        footer={<FlowButton label="Close" onPress={leaveFlow} />}
      >
        <EmptyState
          icon="monitor"
          title="Use the desktop app"
          body="Open SmartEverything on the computer running your server to fix this."
        />
      </FlowFrame>
    );
  }
  return <DesktopFix bridge={bridge} />;
}
