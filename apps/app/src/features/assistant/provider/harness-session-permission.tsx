import { CHAT_ERROR_MESSAGE } from '../model/turn-notice';
import { type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
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
import { permissionKey, permissionLabel } from './harness-permission';

interface SessionPermissionControl {
  readonly mutation: ReturnType<typeof useChangeHarnessPermission>;
  readonly host: AiHarnessHost | undefined;
  readonly policies: readonly AiHarnessPermission[];
  readonly pending: AiHarnessPermissionChange | null;
  readonly disabled: boolean;
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
    disabled: permissionDisabled(session, mutation.isPending, host, policies.length),
  };
}

function permissionDisabled(
  session: AiHarnessSession,
  applying: boolean,
  host: AiHarnessHost | undefined,
  policyCount: number,
): boolean {
  return (
    applying ||
    (session.permission_change !== undefined && session.permission_change !== null) ||
    session.epoch === null ||
    session.state === 'switching' ||
    host?.online !== true ||
    host.manifest?.permission_change !== true ||
    policyCount < 2
  );
}

function PermissionStatus({
  control,
}: {
  readonly control: ReturnType<typeof useSessionPermission>;
}): ReactNode {
  const { mutation, pending, host } = control;
  return (
    <>
      {mutation.isPending ? <Text tone="variant">Applying permissions…</Text> : null}
      {mutation.error === null ? null : <Text tone="critical">{CHAT_ERROR_MESSAGE}</Text>}
      {host?.manifest?.permission_change === true ? null : (
        <Text tone="variant">
          Update this execution host to change permissions in an existing session.
        </Text>
      )}
      {pending === null ? null : (
        <>
          <Text tone="warning">
            Permission change is unconfirmed. Confirm it before changing hosts.
          </Text>
          <Button
            label="Confirm permission change"
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
          Home hub files, shell and system tools stay unavailable.
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

export function changeSessionPermission(
  session: AiHarnessSession,
  control: SessionPermissionControl,
  key: string,
): void {
  const permission = control.policies.find((policy) => permissionKey(policy) === key);
  if (
    control.disabled ||
    permission === undefined ||
    session.epoch === null ||
    key === permissionKey(session.permission)
  )
    return;
  control.mutation.mutate({
    operation_id: randomUUID(),
    expected_epoch: session.epoch,
    permission,
  });
}
