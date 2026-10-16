import { useHarnessCatalogue } from '../data/harness';
import { useContextUsage } from '../data/context-usage';
import type { ContextUsage } from '../model/context-usage';
import { ChatSubscriptionUsage } from '../provider/subscription-usage';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { MCP_TOOLS, type AiChatRow, type AssistantMessageRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { ContextRing } from '../components/context-ring';
import { useMoney } from '../../region';
import { useAiChats } from '../data/chat-store';
import { CONTEXT_COMPACTS_AT } from '../model/chat-subline';
import { useChatIdentity, type ChatIdentity } from './chat-identity';
import { useChatModel } from './chat-model';

function repliesText(rows: readonly AssistantMessageRow[]): string {
  const replies = rows.filter((row) => row.role === 'responder').length;
  return replies === 1 ? '1 reply' : `${count(replies)} replies`;
}

function toolsText(chat: AiChatRow): string {
  if (chat.tools === null) {
    return 'All tools';
  }
  const known = MCP_TOOLS.filter((tool) => chat.tools?.includes(tool.name) === true).length;
  return `${count(known)} of ${count(MCP_TOOLS.length)} tools`;
}

function ContextRow({ percent, label }: ContextUsage): ReactNode {
  if (percent === null) return <ListRow title={label} value="Unavailable" />;
  return (
    <ListRow
      title={label}
      subtitle={`Compacts at ${String(CONTEXT_COMPACTS_AT)} %`}
      trailing={
        <View className="flex-row items-center gap-1.5">
          <ContextRing percent={percent} size={16} />
          <Text variant="callout" tone="variant" className="tabular">
            {`${String(percent)} %`}
          </Text>
        </View>
      }
    />
  );
}

function linkRowsOf(identity: ChatIdentity, kind: AiChatRow['kind']): readonly ReactNode[] {
  const { source, parent } = identity;
  return [
    source.kind === 'plugin' && source.pluginId !== null ? (
      <ListRow
        key="source"
        title={`Started from ${source.label}`}
        chevron
        href={href.pluginSettings(source.pluginId)}
      />
    ) : null,
    parent === null ? null : (
      <ListRow
        key="parent"
        title={
          kind === 'subagent' ? `Parent chat · ${parent.title}` : `Branched from ${parent.title}`
        }
        chevron
        href={href.assistantChat(parent.id)}
      />
    ),
  ];
}

export function InfoRows({
  chat,
  rows,
  onModel,
  onTools,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly onModel: () => void;
  readonly onTools: () => void;
}): ReactNode {
  const model = useChatModel(chat.engine);
  const context = useContextUsage(chat);
  const owner = useIsOwner();
  const readOnly = isComputerEngine(chat.engine) && !owner;
  const identity = useChatIdentity(chat);
  const modelValue =
    model.effort === null ? model.shortName : `${model.shortName} · ${model.effort}`;
  return (
    <List>
      <ListRow title="Model" value={modelValue} chevron onPress={onModel} />
      <ChatBilling chat={chat} rows={rows} />
      <ContextRow {...context} />
      <ListRow
        title="Tools for this chat"
        value={toolsText(chat)}
        disabled={readOnly}
        chevron
        onPress={onTools}
      />
      {linkRowsOf(identity, chat.kind)}
    </List>
  );
}

export function BranchRows({ chatId }: { readonly chatId: string }): ReactNode {
  const branches = useAiChats().filter(
    (chat) => chat.parent_id === chatId && chat.kind !== 'subagent',
  );
  if (branches.length === 0) {
    return (
      <Text tone="variant">
        No branches yet. Branch from a message to continue a different direction.
      </Text>
    );
  }
  return (
    <List title="Branches">
      {branches.map((branch) => (
        <ListRow
          key={branch.id}
          title={branch.title}
          icon="gitBranch"
          chevron
          href={href.assistantChat(branch.id)}
        />
      ))}
    </List>
  );
}

export function FileRows({ rows }: { readonly rows: readonly AssistantMessageRow[] }): ReactNode {
  const files = rows.flatMap((row) => row.attachments);
  if (files.length === 0) {
    return <Text tone="variant">No files in this chat.</Text>;
  }
  return (
    <List title="Files in this chat">
      {files.map((file) => (
        <ListRow
          key={file.id}
          title={file.name}
          icon={file.mime.startsWith('image/') ? 'image' : 'fileText'}
        />
      ))}
    </List>
  );
}

function ChatBilling({
  chat,
  rows,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
}): ReactNode {
  const catalogue = useHarnessCatalogue();
  const money = useMoney();
  const engine = chat.engine;
  const route =
    engine.kind === 'dsh'
      ? catalogue.data?.routes.find((row) => row.id === engine.model_route_id)
      : undefined;
  if (isComputerEngine(engine) || (engine.kind === 'dsh' && route?.billing !== 'metered'))
    return <ChatSubscriptionUsage chat={chat} />;
  const cost =
    chat.cost_incomplete === true
      ? `${money.cost(chat.cost_micros)} known + unavailable`
      : money.cost(chat.cost_micros);
  return (
    <ListRow
      title="Cost"
      value={`${cost} · ${repliesText(rows)}`}
      chevron
      href={href.assistantCosts({ chat: chat.id })}
    />
  );
}
