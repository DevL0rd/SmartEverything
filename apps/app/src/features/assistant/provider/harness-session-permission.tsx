import { type ReactNode } from 'react';
import { View } from 'react-native';
import {
  harnessTargetKey,
  type AiHarnessSession,
  type AiHarnessHost,
  type AiHarnessPermission,
  type AiHarnessPermissionChange,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useHarnessCatalogue } from '../data/harness';
import { useChangeHarnessPermission } from '../data/harness-permission';
import { permissionLabel } from './harness-permission';

interface SessionPermissionControl {
  readonly mutation: ReturnType<typeof useChangeHarnessPermission>;
  readonly host: AiHarnessHost | undefined;
  readonly policies: readonly AiHarnessPermission[];
  readonly pending: AiHarnessPermissionChange | null;
}
export function useSessionPermission(session: AiHarnessSession): SessionPermissionControl {
  const catalogue = useHarnessCatalogue();
  const mutation = useChangeHarnessPermission(session.chat_id);
  const host = catalogue.data?.hosts.find(
    (row) => harnessTargetKey(row.target) === harnessTargetKey(session.target),
  );
  const policies = host?.manifest?.permissions ?? [];
  const pending = session.permission_change ?? null;
  return {
    mutation,
    host,
    policies,
    pending,
  };
}

function PermissionStatus({
  control,
}: {
  readonly control: ReturnType<typeof useSessionPermission>;
}): ReactNode {
  const { mutation, pending, host } = control;
  return (
    <>
      {mutation.isPending ? <Text tone="variant">Changing access…</Text> : null}
      {mutation.error === null ? null : (
        <Text tone="critical">
          {'Couldn’t change access. The machine didn’t confirm the change.'}
        </Text>
      )}
      {host?.manifest?.permission_change === true ? null : (
        <Text tone="variant">Update this machine to change access in a running chat.</Text>
      )}
      {pending === null ? null : (
        <>
          <Text tone="warning">
            Access change not confirmed. Confirm it before you switch machine.
          </Text>
          <Button
            label="Confirm access change"
            variant="text"
            disabled={mutation.isPending}
            onPress={() => {
              mutation.mutate(pending);
            }}
          />
        </>
      )}
    </>
  );
}

function PermissionExplanation({ session }: { readonly session: AiHarnessSession }): ReactNode {
  return (
    <>
      <Text variant="caption" tone="variant">
        Changes apply to subsequent tool actions. Existing approvals still need an answer; running
        actions finish under the previous policy.
      </Text>
      {session.target.kind === 'server' ? (
        <Text variant="caption" tone="variant">
          Only the owner can use system files and commands on Home Hub.
        </Text>
      ) : null}
    </>
  );
}

export function HarnessSessionPermission({
  session,
}: {
  readonly session: AiHarnessSession;
}): ReactNode {
  const control = useSessionPermission(session);
  return (
    <View className="gap-3">
      <Text tone="variant">{permissionLabel(session.permission)}</Text>
      <PermissionStatus control={control} />
      <PermissionExplanation session={session} />
    </View>
  );
}
