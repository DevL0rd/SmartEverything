import { HarnessExecutionContext } from './harness-work';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { useCodexProvider } from './codex-provider-data';
import { useEngineCatalogue } from './provider-data';
import { isComputerEngine, COMPUTER_ENGINE_LABELS } from './computer-engine';
import { ProviderWorkButton } from './runtime-work-sheet';
function CodexFolder({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const owner = useIsOwner();
  const state = useCodexProvider(chat.id, owner);
  return (
    <Text selectable variant="footnote" tone="variant">
      {state.data?.context?.cwd ??
        (owner
          ? 'Preparing workspace on the selected computer'
          : 'Native execution details require the owner')}
    </Text>
  );
}
export function ExecutionContext({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const catalogue = useEngineCatalogue();
  if (chat.engine.kind === 'dsh') return <HarnessExecutionContext chat={chat} />;
  if (!isComputerEngine(chat.engine)) return null;
  const engine = chat.engine;
  const name =
    catalogue.data?.computers.find(
      (computer) => computer.runtime === engine.kind && computer.device_id === engine.device_id,
    )?.name ?? 'Computer unavailable';
  return (
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1">
        <Text variant="label">
          {COMPUTER_ENGINE_LABELS[engine.kind].name} · {name}
        </Text>
        {engine.kind === 'codex' ? (
          <CodexFolder chat={chat} />
        ) : (
          <Text selectable variant="footnote" tone="variant">
            {engine.settings.cwd ?? 'Workspace reported in Work'}
          </Text>
        )}
      </View>
      <ProviderWorkButton chat={chat} />
    </View>
  );
}
