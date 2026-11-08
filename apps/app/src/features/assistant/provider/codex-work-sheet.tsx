import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SelectRow } from '../../../components/rows';
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
import { WorkOperationRow, type WorkOperationSelection } from './work-operation-row';
import { WorkOperationSheet } from './work-operation-sheet';
import { WORK_TABS, type WorkTab } from './work-tabs';
import { NATIVE_OWNER_REASON } from './provider-access';
import type { CodexChatProvider } from '../../../queries/codex-provider-events';
import { RuntimeOverview, RuntimeValue, WorkStatus } from './runtime-overview';
import { background } from '@smarteverything/logging';

function Overview({
  chatId,
  state,
}: {
  readonly chatId: string;
  readonly state: CodexChatProvider;
}): ReactNode {
  return (
    <RuntimeOverview chatId={chatId} metadata={state.metadata} runtime="Codex">
      <RuntimeValue title="Computer ID" value={state.context?.device_id ?? state.device_id} />
      <RuntimeValue
        title="Effective folder"
        value={state.context?.cwd ?? 'Preparing workspace on the selected computer'}
      />
      <RuntimeValue title="Native session" value={state.session_id ?? 'Not started'} />
    </RuntimeOverview>
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
  const [chosen, choose] = useState<WorkOperationSelection<CodexOperation> | null>(() => {
    const operation = CODEX_OPERATIONS.find(
      (row) => row.id === requested && row.kind === kind && supported.includes(row.id),
    );
    return operation === undefined ? null : { operation };
  });
  const operations = CODEX_OPERATIONS.filter((row) => row.kind === kind);
  return (
    <View className="gap-section-gap">
      <List footer="Only operations implemented by this chat’s exact runtime can run.">
        <OperationRows operations={operations} state={state} choose={choose} />
      </List>
      {chosen === null ? null : (
        <WorkOperationSheet
          title={chosen.operation.title}
          opener={chosen.opener}
          onClose={() => {
            choose(null);
          }}
        >
          <CodexOperationForm
            key={chosen.operation.id}
            chatId={chatId}
            operation={chosen.operation}
            sessionId={state.session_id}
          />
        </WorkOperationSheet>
      )}
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
    <View className="gap-3">
      <List>
        <NavRow
          title={name}
          subtitle="Codex coding runs on this computer"
          href={href.settings.device(state.device_id, 'codex')}
        />
      </List>
      <WorkStatus value={state.reason ?? state.state} />
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
    <Sheet title="Codex on your computer" open={open} onClose={onClose} detents={['fit']}>
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
  readonly choose: (selection: WorkOperationSelection<CodexOperation>) => void;
}): ReactNode {
  const supported = state.metadata?.operations ?? [];
  return (
    <>
      {operations.map((operation) => (
        <WorkOperationRow
          key={operation.id}
          operation={operation}
          available={supported.includes(operation.id)}
          subtitle={operation.description}
          unavailableReason={
            state.metadata?.unavailable_operations[operation.id] ??
            'Unavailable in this runtime or session'
          }
          choose={choose}
        />
      ))}
    </>
  );
}
