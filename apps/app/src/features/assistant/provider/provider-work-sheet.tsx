import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AiChatProvider } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SelectRow, ValueRow } from '../../../components/rows';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { useIsOwner } from '../../../store/selectors';
import { NATIVE_OWNER_REASON } from './provider-access';
import { Text } from '../../../components/text';
import { ProviderOptions, QueryState } from '../../computers';
import { changeChat } from '../chats/chat-actions';
import { useChatProvider, useEngineCatalogue } from './provider-data';
import { FlagSettings } from './flag-settings';
import { OperationForm } from './operation-form';
import { PROVIDER_OPERATIONS, type ProviderOperation } from './provider-operations';
import { ProviderPrompt } from './provider-prompts';
import { NativeMcpControl } from './native-mcp-control';
import { ProviderEvents } from './provider-events';
import { RuntimeOverview } from './runtime-overview';

import { WORK_TABS, type WorkTab } from './work-tabs';
import { background } from '@smarteverything/logging';

function OperationSheet({
  chatId,
  chosen,
  sessionId,
  close,
}: {
  readonly chatId: string;
  readonly chosen: ProviderOperation | null;
  readonly sessionId: string | null;
  readonly close: () => void;
}): ReactNode {
  return (
    <Sheet
      open={chosen !== null}
      title={chosen?.title ?? 'Provider action'}
      onClose={() => {
        close();
      }}
      detents={['full']}
    >
      {chosen === null ? null : (
        <OperationForm key={chosen.id} chatId={chatId} operation={chosen} sessionId={sessionId} />
      )}
    </Sheet>
  );
}

function OperationRow({
  operation,
  available,
  reason,
  choose,
}: {
  readonly operation: ProviderOperation;
  readonly available: boolean;
  readonly reason: string;
  readonly choose: (operation: ProviderOperation) => void;
}): ReactNode {
  return (
    <View>
      <NavRow
        title={operation.title}
        subtitle={available ? operation.description : 'Unavailable'}
        disabled={!available}
        onPress={() => {
          choose(operation);
        }}
      />
      {available ? null : (
        <Text selectable variant="footnote" tone="variant" className="px-4 pb-3">
          {reason}
        </Text>
      )}
    </View>
  );
}

function OperationRows({
  operations,
  available,
  state,
  choose,
}: {
  readonly operations: readonly ProviderOperation[];
  readonly available: readonly string[];
  readonly state: AiChatProvider;
  readonly choose: (operation: ProviderOperation) => void;
}): ReactNode {
  return (
    <List footer="Availability comes from this chat’s actual runtime metadata.">
      {operations.map((operation) => (
        <OperationRow
          key={operation.id}
          operation={operation}
          available={available.includes(operation.id)}
          reason={
            state.metadata?.unavailable_operations[operation.id] ??
            'Unavailable in this runtime or session'
          }
          choose={choose}
        />
      ))}
    </List>
  );
}

function Operations({
  chatId,
  state,
  kind,
  requested,
}: {
  readonly chatId: string;
  readonly state: AiChatProvider;
  readonly kind: 'control' | 'read';
  readonly requested?: string;
}): ReactNode {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<ProviderOperation | null>(
    PROVIDER_OPERATIONS.find(
      (operation) =>
        operation.id === requested &&
        operation.kind === kind &&
        state.metadata?.operations.includes(operation.id) === true,
    ) ?? null,
  );
  const operations = PROVIDER_OPERATIONS.filter(
    (operation) =>
      operation.kind === kind &&
      `${operation.title} ${operation.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const available = state.metadata?.operations ?? [];
  return (
    <View className="gap-3">
      <SearchField value={query} onChange={setQuery} placeholder="Find a runtime action" />
      <OperationRows
        operations={operations}
        available={available}
        state={state}
        choose={setChosen}
      />
      <OperationSheet
        chatId={chatId}
        chosen={chosen}
        sessionId={state.session_id}
        close={() => {
          setChosen(null);
        }}
      />
    </View>
  );
}

function ProviderSettings({
  chat,
  state,
  focus,
}: {
  readonly chat: AiChatRow;
  readonly state: AiChatProvider;
  readonly focus?: string;
}): ReactNode {
  const [saving, setSaving] = useState(false);
  if (chat.engine.kind !== 'claude') return null;
  const engine = chat.engine;
  return (
    <View className="gap-section-gap">
      {state.metadata === null ? (
        <Text tone="variant">
          Native settings metadata is unavailable until the provider session is initialized.
        </Text>
      ) : (
        <FlagSettings
          chatId={chat.id}
          metadata={state.metadata}
          {...(focus === undefined ? {} : { focus })}
        />
      )}
      <Text variant="title-3">Options for the next turn</Text>
      <ProviderOptions
        permissionControls={false}
        options={engine.settings}
        {...(state.metadata === null ? {} : { metadata: state.metadata })}
        pending={saving}
        save={(options) => {
          setSaving(true);
          background(
            changeChat(chat.id, { engine: { ...engine, settings: options } }).finally(() => {
              setSaving(false);
            }),
            'chat.change_failed',
          );
        }}
      />
    </View>
  );
}

function PromptList({
  chatId,
  state,
}: {
  readonly chatId: string;
  readonly state: AiChatProvider;
}): ReactNode {
  const pending = state.prompts.filter((prompt) => prompt.status === 'pending');
  return (
    <View className="gap-section-gap">
      {pending.length === 0 ? (
        <Text tone="variant">No requests waiting.</Text>
      ) : (
        pending.map((prompt) => <ProviderPrompt key={prompt.id} chatId={chatId} prompt={prompt} />)
      )}
    </View>
  );
}
function McpView({
  chat,
  state,
}: {
  readonly chat: AiChatRow;
  readonly state: AiChatProvider;
}): ReactNode {
  return state.metadata?.operations.includes('set_mcp_servers') === true ? (
    <NativeMcpControl chat={chat} />
  ) : (
    <Text tone="variant">
      {state.metadata?.unavailable_operations['set_mcp_servers'] ??
        'Native MCP configuration is unavailable until this provider session initializes.'}
    </Text>
  );
}
function settingFocus(operation: string | undefined): { readonly focus?: string } {
  return operation?.startsWith('flag:') === true ? { focus: operation.slice(5) } : {};
}
function WorkView({
  chat,
  state,
  tab,
  operation,
}: {
  readonly chat: AiChatRow;
  readonly state: AiChatProvider;
  readonly tab: WorkTab;
  readonly operation?: string;
}): ReactNode {
  switch (tab) {
    case 'overview':
      return state.metadata === null ? (
        <Text tone="variant">
          Runtime metadata is unavailable. Start a turn on the selected computer to initialize its
          provider session.
        </Text>
      ) : (
        <RuntimeOverview chatId={chat.id} metadata={state.metadata} />
      );
    case 'prompts':
      return <PromptList chatId={chat.id} state={state} />;
    case 'events':
      return <ProviderEvents events={state.events} />;
    case 'mcp':
      return <McpView chat={chat} state={state} />;
    case 'settings':
      return <ProviderSettings chat={chat} state={state} {...settingFocus(operation)} />;
    case 'control':
    case 'read':
      return (
        <Operations
          chatId={chat.id}
          state={state}
          kind={tab}
          {...(operation === undefined ? {} : { requested: operation })}
        />
      );
  }
}

function ProviderSummary({
  name,
  state,
}: {
  readonly name: string;
  readonly state: AiChatProvider;
}): ReactNode {
  return (
    <List>
      <NavRow
        title={name}
        subtitle="Runs on this computer"
        href={href.settings.device(state.device_id, 'claude')}
      />
      <View className="gap-1 px-4 py-3">
        <Text variant="footnote" tone="variant">
          Provider session
        </Text>
        <Text selectable>{state.session_id ?? 'Not started'}</Text>
      </View>
      <ValueRow title="State" value={state.reason ?? state.state} />
    </List>
  );
}

function WorkBody({
  chat,
  state,
  initial,
  operation,
}: {
  readonly chat: AiChatRow;
  readonly state: AiChatProvider;
  readonly initial: WorkTab;
  readonly operation?: string;
}): ReactNode {
  const [tab, setWorkTab] = useState<WorkTab>(initial);
  const catalogue = useEngineCatalogue();
  const name =
    catalogue.data?.computers.find((computer) => computer.device_id === state.device_id)?.name ??
    'Computer unavailable';
  return (
    <View className="gap-section-gap">
      <ProviderSummary name={name} state={state} />
      <SelectRow title="Work with Claude" value={tab} options={WORK_TABS} onChange={setWorkTab} />
      <WorkView
        chat={chat}
        state={state}
        tab={tab}
        {...(operation === undefined ? {} : { operation })}
      />
    </View>
  );
}

export function ClaudeWorkSheet({
  chat,
  open,
  onClose,
  initial = 'overview',
  operation,
}: {
  readonly initial?: WorkTab;
  readonly operation?: string;
  readonly chat: AiChatRow;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const owner = useIsOwner();
  const provider = useChatProvider(chat.id, open && owner && chat.engine.kind === 'claude');
  return (
    <Sheet title="Claude on your computer" open={open} onClose={onClose} detents={['full']}>
      {owner ? (
        <QueryState
          error={provider.error}
          pending={provider.isPending}
          retry={() => {
            background(provider.refetch(), 'provider.refetch_failed');
          }}
        />
      ) : (
        <Text tone="variant">{NATIVE_OWNER_REASON}</Text>
      )}
      {provider.data === undefined || !open || !owner ? null : (
        <WorkBody
          chat={chat}
          state={provider.data}
          initial={initial}
          {...(operation === undefined ? {} : { operation })}
        />
      )}
    </Sheet>
  );
}
