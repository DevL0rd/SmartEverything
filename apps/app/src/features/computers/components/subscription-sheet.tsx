import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiSubscriptionProvider, AiSubscriptionHostStatus } from '@smarteverything/domain';
import { Button, type ButtonProps } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useSubscriptionControl, type SubscriptionControl } from '../data/subscription';
import { SUBSCRIPTION_LABELS, subscriptionTitle } from '../model/subscription';
import { SubscriptionInteraction } from './subscription-interaction';
interface Props {
  readonly deviceId: string;
  readonly provider: AiSubscriptionProvider;
  readonly profileId: string;
  readonly identity: string;
  readonly unavailable: string | null;
  readonly close: () => void;
  readonly changed: (status: AiSubscriptionHostStatus) => void;
}
export function SubscriptionSheet(props: Props): ReactNode {
  return (
    <Sheet open title={subscriptionTitle(props.provider)} onClose={props.close}>
      <Text variant="footnote" tone="variant">
        {props.identity}
      </Text>
      {props.unavailable === null ? (
        <Enrollment {...props} />
      ) : (
        <Text tone="warning">{props.unavailable}</Text>
      )}
    </Sheet>
  );
}
function Enrollment(props: Props): ReactNode {
  const state = useSubscriptionControl(props);
  const interaction = state.status?.interaction;
  return (
    <View className="gap-3 py-3">
      {state.status === null ? (
        <Text tone="variant">
          {state.pending ? 'Checking subscription…' : 'Subscription status has not been checked.'}
        </Text>
      ) : (
        <>
          <Text variant="title-3" accessibilityRole="header">
            {SUBSCRIPTION_LABELS[state.status.state]}
          </Text>
          <Text>{state.status.message}</Text>
        </>
      )}
      {interaction === undefined || interaction === null ? null : (
        <SubscriptionInteraction
          key={`${JSON.stringify(interaction)}:${String(state.inputRevision)}`}
          interaction={interaction}
          pending={state.pending}
          acknowledged={state.acknowledged}
          answer={async (answer) => {
            await state.control({
              kind: 'answer',
              enrollment_id: interaction.enrollment_id,
              answer,
            });
          }}
        />
      )}
      <EnrollmentActions state={state} />
      <View role="status" aria-live="polite" accessibilityLiveRegion="polite">
        {state.pending ? <Text tone="variant">Updating subscription…</Text> : null}
        {state.error === null ? null : <Text tone="critical">{state.error}</Text>}
      </View>
      <Text variant="footnote" tone="variant">
        Subscription billing only. No paid fallback. Use this computer as the execution host for
        this route.
      </Text>
    </View>
  );
}

interface EnrollmentAction {
  readonly label: string;
  readonly variant: NonNullable<ButtonProps['variant']>;
  readonly command: Parameters<SubscriptionControl['control']>[0];
}
function enrollmentActions(status: AiSubscriptionHostStatus | null): readonly EnrollmentAction[] {
  const actions: EnrollmentAction[] = [
    { label: 'Check status', variant: 'outlined', command: { kind: 'status' } },
  ];
  if (status === null) return actions;
  if (['missing_login', 'missing_scope', 'failed'].includes(status.state))
    actions.unshift({
      label: status.state === 'missing_scope' ? 'Sign in again' : 'Sign in',
      variant: 'filled',
      command: { kind: 'enroll' },
    });
  if (status.state === 'authorizing')
    actions.push({
      label: 'Cancel sign-in',
      variant: 'outlined',
      command:
        status.interaction === null
          ? { kind: 'disconnect' }
          : { kind: 'cancel', enrollment_id: status.interaction.enrollment_id },
    });
  if (status.state !== 'authorizing' && status.state !== 'missing_login')
    actions.push({ label: 'Disconnect', variant: 'text', command: { kind: 'disconnect' } });
  return actions;
}
function EnrollmentActions({ state }: { readonly state: SubscriptionControl }): ReactNode {
  return (
    <View className="gap-2">
      {enrollmentActions(state.status).map((action) => (
        <Button
          key={action.command.kind}
          label={action.label}
          variant={action.variant}
          size="lg"
          disabled={state.pending}
          onPress={() => {
            void state.control(action.command);
          }}
        />
      ))}
      {state.completed !== 'disconnect' || state.status === null ? null : (
        <Text variant="footnote" tone="variant">
          Credentials removed from this computer.
          {state.status.remote_revocation_confirmed === true
            ? ' Remote provider sessions were revoked.'
            : ' Remote provider sessions may remain signed in.'}
        </Text>
      )}
    </View>
  );
}
