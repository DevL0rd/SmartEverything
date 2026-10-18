import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SelectRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { CodexOptions, QueryState } from '../../computers';
import { changeChat } from '../chats/chat-actions';
import { useProviderWorking } from '../provider/provider-working';
import { useCodexProvider } from './codex-provider-data';
import { CodexProviderPrompt } from './codex-provider-prompts';
import { CodexProviderEvents } from './codex-provider-events';
import { CodexOperationForm } from './codex-operation-form';
import { CODEX_OPERATIONS, type CodexOperation } from './codex-operations';
import { useEngineCatalogue } from './provider-data';
import { WORK_TABS, type WorkTab } from './work-tabs';
import { NATIVE_OWNER_REASON } from './provider-access';
import type { CodexChatProvider } from '../../../queries/codex-provider-events';
import { RuntimeOverview } from './runtime-overview';
import { background } from '@smarteverything/logging';

function Overview({
  chatId,
  state,
}: {
  readonly chatId: string;
  readonly state: CodexChatProvider;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <List title="Execution">
        <View className="gap-1 px-4 py-3">
          <Text variant="footnote" tone="variant">
            Computer ID
          </Text>
          <Text selectable>{state.context?.device_id ?? state.device_id}</Text>
        </View>
        <View className="gap-1 px-4 py-3">
          <Text variant="footnote" tone="variant">
            Effective folder
          </Text>
          <Text selectable>
            {state.context?.cwd ?? 'Preparing workspace on the selected computer'}
          </Text>
        </View>
        <ValueRow title="State" value={state.reason ?? state.state} />
        <View className="gap-1 px-4 py-3">
          <Text variant="footnote" tone="variant">
            Native session
          </Text>
          <Text selectable>{state.session_id ?? 'Not started'}</Text>
        </View>
      </List>
      {state.metadata === null ? (
        <Text tone="variant">
          Runtime metadata becomes available when this session initializes.
        </Text>
      ) : (
        <RuntimeOverview chatId={chatId} metadata={state.metadata} runtime="Codex" />
      )}
    </View>
  );
}
function Options({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const working = useProviderWorking(chat);
  const [saving, setSaving] = useState(false);
  if (chat.engine.kind !== 'codex') return null;
  const engine = chat.engine;
  return (
    <CodexOptions
      permissionControls={false}
      key={JSON.stringify(engine.settings)}
      options={engine.settings}
      pending={saving}
      disabled={working}
      save={(settings) => {
        setSaving(true);
        background(
          changeChat(chat.id, { engine: { ...engine, settings } }).finally(() => {
            setSaving(false);
          }),
          'chat.change_failed',
        );
      }}
    />
  );
}
function Operations({
  chatId,
  state,
  kind,
  requested,
}: {
  readonly chatId: string;
  readonly state: CodexChatProvider;
  readonly kind: 'control' | 'read';
  readonly requested?: string;
}): ReactNode {
  const supported = state.metadata?.operations ?? [];
  const [chosen, choose] = useState<CodexOperation | null>(
    CODEX_OPERATIONS.find(
      (row) => row.id === requested && row.kind === kind && supported.includes(row.id),
    ) ?? null,
  );
  const operations = CODEX_OPERATIONS.filter((row) => row.kind === kind);
  return (
    <View className="gap-section-gap">
      <List footer="Only operations implemented by this chat’s exact runtime can run.">
        <OperationRows operations={operations} state={state} choose={choose} />
      </List>
      <Sheet
        title={chosen?.title ?? 'Codex action'}
        open={chosen !== null}
        onClose={() => {
          choose(null);
        }}
        detents={['full']}
      >
        {chosen === null ? null : (
          <CodexOperationForm
            key={chosen.id}
            chatId={chatId}
            operation={chosen}
            sessionId={state.session_id}
          />
        )}
      </Sheet>
    </View>
  );
}
function WorkView({
  chat,
  state,
  tab,
  operation,
}: {
  readonly chat: AiChatRow;
  readonly state: CodexChatProvider;
  readonly tab: WorkTab;
  readonly operation?: string;
}): ReactNode {
  switch (tab) {
    case 'overview':
      return <Overview chatId={chat.id} state={state} />;
    case 'events':
      return <CodexProviderEvents events={state.events} />;
    case 'settings':
      return <Options chat={chat} />;
    case 'prompts':
      return (
        <View className="gap-section-gap">
          {state.prompts.every((prompt) => prompt.status !== 'pending') ? (
            <Text tone="variant">No pending Codex requests.</Text>
          ) : (
            state.prompts.map((prompt) => (
              <CodexProviderPrompt key={prompt.id} chatId={chat.id} prompt={prompt} />
            ))
          )}
        </View>
      );
    case 'mcp':
      return <Operations chatId={chat.id} state={state} kind="read" requested="mcp_status" />;
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
function Body({
  chat,
  state,
  initial,
  operation,
}: {
  readonly chat: AiChatRow;
  readonly state: CodexChatProvider;
  readonly initial: WorkTab;
  readonly operation?: string;
}): ReactNode {
  const [tab, change] = useState(initial);
  const catalogue = useEngineCatalogue();
  const name =
    catalogue.data?.computers.find(
      (computer) => computer.runtime === 'codex' && computer.device_id === state.device_id,
    )?.name ?? 'Computer unavailable';
  return (
    <View className="gap-section-gap">
      <List>
        <NavRow
          title={name}
          subtitle="Codex coding runs on this computer"
          href={href.settings.device(state.device_id, 'codex')}
        />
      </List>
      <SelectRow title="Work with Codex" value={tab} options={WORK_TABS} onChange={change} />
      <WorkView
        chat={chat}
        state={state}
        tab={tab}
        {...(operation === undefined ? {} : { operation })}
      />
    </View>
  );
}
export function CodexWorkSheet({
  chat,
  open,
  onClose,
  initial = 'overview',
  operation,
}: {
  readonly chat: AiChatRow;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly initial?: WorkTab;
  readonly operation?: string;
}): ReactNode {
  const owner = useIsOwner();
  const state = useCodexProvider(chat.id, open && owner);
  return (
    <Sheet title="Codex on your computer" open={open} onClose={onClose} detents={['full']}>
      {!owner ? (
        <Text tone="variant">{NATIVE_OWNER_REASON}</Text>
      ) : (
        <>
          <QueryState
            error={state.error}
            pending={state.isPending}
            retry={() => {
              background(state.refetch(), 'state.refetch_failed');
            }}
          />
          {state.data === undefined || !open ? null : (
            <Body
              chat={chat}
              state={state.data}
              initial={initial}
              {...(operation === undefined ? {} : { operation })}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

function OperationRows({
  operations,
  state,
  choose,
}: {
  readonly operations: readonly CodexOperation[];
  readonly state: CodexChatProvider;
  readonly choose: (value: CodexOperation) => void;
}): ReactNode {
  const supported = state.metadata?.operations ?? [];
  return (
    <>
      {operations.map((operation) => (
        <View key={operation.id}>
          <NavRow
            title={operation.title}
            subtitle={operation.description}
            disabled={!supported.includes(operation.id)}
            onPress={() => {
              choose(operation);
            }}
          />
          {supported.includes(operation.id) ? null : (
            <Text tone="variant" variant="footnote" selectable className="px-4 pb-3">
              {state.metadata?.unavailable_operations[operation.id] ??
                'Unavailable in this runtime or session'}
            </Text>
          )}
        </View>
      ))}
    </>
  );
}
