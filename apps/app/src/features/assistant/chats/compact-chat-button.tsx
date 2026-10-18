import { useEffect, useState, type ReactNode } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import { harnessTargetKey } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useHarnessCatalogue } from '../data/harness';
import { compactChat } from './chat-actions';
import { useCommands } from '../commands/catalogue';
import { useCommandSubmission } from '../commands/submission';
import { nativeRuntimeAdapter } from '../commands/native-registry';
import type { CommandReceipt } from '../commands/panels';
import type { CommandDescriptor } from '../commands/types';
import { notify } from '../../../components/toast-store';
import { background } from '@smarteverything/logging';

export function CompactChatButton({
  chat,
  blocked,
}: {
  readonly chat: AiChatRow;
  readonly blocked: boolean;
}): ReactNode {
  if (chat.engine.kind === 'codex' || chat.engine.kind === 'claude')
    return <NativeCompactChatButton chat={chat} blocked={blocked} />;
  return <LegacyCompactChatButton chat={chat} blocked={blocked} />;
}
function LegacyCompactChatButton({
  chat,
  blocked,
}: {
  readonly chat: AiChatRow;
  readonly blocked: boolean;
}): ReactNode {
  const [pending, setPending] = useState(false);
  const reason = useCompactionReason(chat);
  const disabled = blocked || pending || reason !== null;
  return (
    <Interactive
      label={reason ?? (blocked ? 'Compact after active work finishes' : 'Compact chat context')}
      disabled={disabled}
      className="min-h-touch-min flex-row items-center gap-1 rounded-md px-1.5"
      layerClassName="rounded-md"
      onPress={(): void => {
        setPending(true);
        background(
          compactChat(chat.id).finally(() => {
            setPending(false);
          }),
          'chat.compact_failed',
        );
      }}
    >
      <Icon name={pending ? 'clock' : 'minimize'} size={16} tone="variant" />
      <Text variant="caption" tone="variant">
        Compact
      </Text>
    </Interactive>
  );
}

function useCompactionReason(chat: AiChatRow): string | null {
  const catalogue = useHarnessCatalogue();
  if (chat.engine.kind !== 'dsh') return null;
  const target = harnessTargetKey(chat.engine.execution_target);
  const host = catalogue.data?.hosts.find((entry) => harnessTargetKey(entry.target) === target);
  return host?.manifest?.features.includes('compaction') === true
    ? null
    : 'This runtime does not report compaction support.';
}

function NativeCompactChatButton({
  chat,
  blocked,
}: {
  readonly chat: AiChatRow;
  readonly blocked: boolean;
}): ReactNode {
  const catalogue = useCommands(chat, true);
  const commands = compactCommands(catalogue);
  const compact = compactDefinition(commands);
  const submission = useCommandSubmission({ ...catalogue, commands }, '', () => '/compact', {
    preserveDraft: true,
    definitionId: compact?.id ?? null,
  });
  const receipt = submission.receipt?.value;
  const pending = compactPending(receipt);
  const reason = compactReason(catalogue.reason, compact, commands.length);
  useCompactNotice(receipt);
  return (
    <Interactive
      label={reason ?? (blocked ? 'Compact after active work finishes' : 'Compact chat context')}
      disabled={blocked || pending || reason !== null}
      className="min-h-touch-min flex-row items-center gap-1 rounded-md px-1.5"
      layerClassName="rounded-md"
      onPress={(): void => {
        background(submission.submit(null, []), 'submission.submit_failed');
      }}
    >
      <Icon name={pending ? 'clock' : 'minimize'} size={16} tone="variant" />
      <Text variant="caption" tone="variant">
        Compact
      </Text>
    </Interactive>
  );
}

function compactReason(
  reason: string | null,
  command: CommandDescriptor | undefined,
  count: number,
): string | null {
  if (reason === null && command === undefined && count > 1)
    return 'Couldn’t find the compact command. Refresh commands and try again.';
  return (
    reason ??
    command?.unavailableReason ??
    (command?.enabled === true ? null : 'This session has no compact command.')
  );
}

function compactCommands(
  catalogue: ReturnType<typeof useCommands>,
): ReturnType<typeof useCommands>['commands'] {
  const scope = catalogue.scope;
  return scope?.kind === 'native'
    ? catalogue.commands.filter(nativeRuntimeAdapter(scope.value.runtime).compact)
    : [];
}
function useCompactNotice(receipt: CommandReceipt | undefined): void {
  useEffect(() => {
    if (receipt === undefined) return;
    notify({
      message: `Compaction ${receipt.state}`,
      detail: receipt.text,
      tone: ['not run', 'outcome unknown', 'interrupted', 'failed'].includes(receipt.state)
        ? 'critical'
        : 'default',
    });
  }, [receipt]);
}

function compactPending(receipt: CommandReceipt | undefined): boolean {
  return receipt !== undefined && ['submitting', 'admitted', 'running'].includes(receipt.state);
}

function compactDefinition(commands: readonly CommandDescriptor[]): CommandDescriptor | undefined {
  const enabled = commands.filter(
    (command) => command.enabled && command.unavailableReason === null,
  );
  const command = enabled.length === 1 ? enabled[0] : undefined;
  if (command === undefined) return commands.length === 1 ? commands[0] : undefined;
  return commands.filter((row) => row.id === command.id).length === 1 ? command : undefined;
}
