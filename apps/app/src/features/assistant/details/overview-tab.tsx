import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { count } from '../../../format/number';
import { useDevice, useIsOwner } from '../../../store/selectors';
import { useMoney } from '../../region';
import { CompactChatButton } from '../chats/compact-chat-button';
import { useChatIdentity } from '../chats/chat-identity';
import { useChatModel } from '../chats/chat-model';
import { useExecutionLine } from '../chats/use-execution-line';
import { ContextRing } from '../components/context-ring';
import { useChatWorking } from '../data/chat-store';
import { useContextUsage } from '../data/context-usage';
import { useChatHarness, useHarnessCatalogue } from '../data/harness';
import { CONTEXT_COMPACTS_AT } from '../model/chat-subline';
import { isComputerEngine } from '../provider/computer-engine';
import { useProviderWorking } from '../provider/provider-working';
import { ChatSubscriptionUsage } from '../provider/subscription-usage';
import { accessSummary } from './access-summary';
import { useGo, useOpenPanel } from './details-scope';
import { linkRowsOf } from './overview-links';

const INLINE_VALUE_MAX = 36;

function valueOf(text: string):
  | { readonly value: string }
  | {
      readonly subtitle: string;
      readonly wrapSubtitle: true;
    } {
  return text.length > INLINE_VALUE_MAX ? { subtitle: text, wrapSubtitle: true } : { value: text };
}

function ModelRow({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const model = useChatModel(chat.engine);
  const open = useOpenPanel();
  return (
    <ListRow
      title="Model"
      {...valueOf(model.effort === null ? model.shortName : `${model.shortName} · ${model.effort}`)}
      chevron
      onPress={() => {
        open('model');
      }}
    />
  );
}

function useRunsOnPress(chat: AiChatRow): (() => void) | null {
  const engine = chat.engine;
  const device = useDevice(isComputerEngine(engine) ? engine.device_id : '');
  const open = useOpenPanel();
  const go = useGo();
  if (engine.kind === 'dsh') {
    return (): void => {
      open('device');
    };
  }
  return device === null
    ? null
    : (): void => {
        go(href.device(device));
      };
}

function RunsOnRow({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const where = useExecutionLine(chat);
  const press = useRunsOnPress(chat);
  return (
    <ListRow
      title="Runs on"
      {...valueOf(where.text)}
      {...(where.warning ? { icon: 'warning' as const, iconTone: 'warning' as const } : {})}
      {...(press === null ? {} : { chevron: true, onPress: press })}
    />
  );
}

function AccessRow({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const engine = chat.engine;
  const session = useChatHarness(chat.id, engine.kind === 'dsh' && engine.session_id !== null);
  const open = useOpenPanel();
  return (
    <ListRow
      title="Access"
      {...valueOf(accessSummary(chat, session.data?.permission ?? null))}
      chevron
      onPress={() => {
        open('access');
      }}
    />
  );
}

function ContextRow({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const context = useContextUsage(chat);
  const owner = useIsOwner();
  const working = useChatWorking(chat.id);
  const nativeWorking = useProviderWorking(chat);
  if (context.percent === null) return <ListRow title={context.label} value="Unavailable" />;
  return (
    <ListRow
      title={context.label}
      subtitle={`${String(context.percent)} % · compacts at ${String(CONTEXT_COMPACTS_AT)} %`}
      leading={<ContextRing percent={context.percent} size={24} />}
      trailing={
        <CompactChatButton
          chat={chat}
          blocked={working || nativeWorking || (isComputerEngine(chat.engine) && !owner)}
        />
      }
    />
  );
}

function repliesText(rows: readonly AssistantMessageRow[]): string {
  const replies = rows.filter((row) => row.role === 'responder').length;
  return replies === 1 ? '1 reply' : `${count(replies)} replies`;
}

function useMetered(chat: AiChatRow): boolean {
  const catalogue = useHarnessCatalogue();
  const engine = chat.engine;
  if (engine.kind === 'openrouter') return true;
  if (engine.kind !== 'dsh') return false;
  return (
    catalogue.data?.routes.find((row) => row.id === engine.model_route_id)?.billing === 'metered'
  );
}

function CostRow({
  chat,
  rows,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
}): ReactNode {
  const money = useMoney();
  const go = useGo();
  const known = money.cost(chat.cost_micros);
  const cost = chat.cost_incomplete === true ? `${known} known + unavailable` : known;
  return (
    <ListRow
      title="Cost"
      value={`${cost} · ${repliesText(rows)}`}
      chevron
      onPress={() => {
        go(href.assistantCosts({ chat: chat.id }));
      }}
    />
  );
}

export function OverviewTab({
  chat,
  rows,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
}): ReactNode {
  const metered = useMetered(chat);
  const identity = useChatIdentity(chat);
  const go = useGo();
  return (
    <View className="gap-section-gap pb-3">
      <List>
        {[
          <ModelRow key="model" chat={chat} />,
          <RunsOnRow key="runs" chat={chat} />,
          <AccessRow key="access" chat={chat} />,
          <ContextRow key="context" chat={chat} />,
          metered ? <CostRow key="cost" chat={chat} rows={rows} /> : null,
          ...linkRowsOf(identity, chat.kind, go),
        ]}
      </List>
      {metered ? null : <ChatSubscriptionUsage chat={chat} />}
    </View>
  );
}
