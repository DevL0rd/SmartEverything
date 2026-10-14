import { isComputerEngine } from '../provider/computer-engine';
import { ChatSubscriptionUsage } from '../provider/subscription-usage';
import type { ReactNode } from 'react';
import type { AssistantMessageRow, AiChatRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { clock, dayLabel, duration } from '../../../format/time';
import { plural } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';
import { useAiChat } from '../data/chat-store';
import { moneyNoteOf, useMoney, type Money } from '../../region';
import { usePluginNames } from '../data/plugin-names';
import { modelIdName } from '../model/model-name';
import { sourceLabelOf, viaLabelOf } from '../model/speaker';
import { useModelRow } from '../picker/model-queries';

function tookOf(row: AssistantMessageRow): string | null {
  if (row.role !== 'responder' || row.state !== 'answered') {
    return null;
  }
  const seconds = (Date.parse(row.updated_at) - Date.parse(row.created_at)) / 1000;
  return seconds < 1 ? 'Under a second' : duration(seconds);
}

function ModelValue({ model }: { readonly model: string }): ReactNode {
  const row = useModelRow(model);
  return <ListRow title="Model" value={row.data?.name ?? modelIdName(model)} />;
}

function costRowsOf(messageMicros: number, chatMicros: number, money: Money): readonly ReactNode[] {
  if (messageMicros === 0) {
    return [];
  }
  const note = moneyNoteOf(money.format);
  return [
    <ListRow key="cost" title="Cost" value={money.cost(messageMicros)} />,
    ...(chatMicros === 0
      ? []
      : [<ListRow key="chat" title="Chat total" value={money.cost(chatMicros)} />]),
    ...(note === null
      ? []
      : [
          <ListRow
            key="currency"
            title="Currency"
            value={money.format.currency}
            subtitle={note}
            wrapSubtitle
          />,
        ]),
  ];
}

function Rows({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const plugins = usePluginNames();
  const source = sourceLabelOf(row, plugins) ?? viaLabelOf(row);
  const took = tookOf(row);
  const chat = useAiChat(row.chat_id);
  const money = useMoney();
  return (
    <List inset>
      <ListRow
        title="Sent"
        value={`${dayLabel(row.created_at, now, timeZone)} · ${clock(row.created_at, timeZone)}`}
      />
      {source === null ? null : <ListRow title="From" value={`${source} · ${row.author}`} />}
      {row.model === null ? null : <ModelValue model={row.model} />}
      <ChatCostRows chat={chat} row={row} money={money} />
      {took === null ? null : <ListRow title="Took" value={took} />}
      {row.steps.length === 0 ? null : (
        <ListRow title="Tools" value={plural(row.steps.length, 'step')} />
      )}
      {subscriptionChat(chat) ? null : (
        <>
          {' '}
          <ListRow
            title="See costs for this chat"
            chevron
            href={href.assistantCosts({ chat: row.chat_id })}
          />
        </>
      )}
    </List>
  );
}

export function MessageDetails({
  row,
  open,
  onClose,
}: {
  readonly row: AssistantMessageRow;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="Message details" detents={['fit']}>
      <Rows row={row} />
    </Sheet>
  );
}

function subscriptionChat(chat: AiChatRow | null): boolean {
  return chat !== null && isComputerEngine(chat.engine);
}
function ChatCostRows({
  chat,
  row,
  money,
}: {
  readonly chat: AiChatRow | null;
  readonly row: AssistantMessageRow;
  readonly money: Money;
}): ReactNode {
  if (row.cost_incomplete === true || chat?.cost_incomplete === true)
    return <IncompleteCostRows chat={chat} row={row} money={money} />;
  return chat !== null && isComputerEngine(chat.engine) ? (
    <ChatSubscriptionUsage chat={chat} />
  ) : (
    costRowsOf(row.cost_micros, chat?.cost_micros ?? 0, money)
  );
}

function IncompleteCostRows({
  chat,
  row,
  money,
}: {
  readonly chat: AiChatRow | null;
  readonly row: AssistantMessageRow;
  readonly money: Money;
}): ReactNode {
  return (
    <>
      <ListRow
        title="Cost"
        value={
          row.cost_incomplete === true ? 'Supplier cost unavailable' : money.cost(row.cost_micros)
        }
      />
      <ListRow
        title="Chat total"
        value={`${money.cost(chat?.cost_micros ?? 0)} known${chat?.cost_incomplete === true ? ' + unavailable' : ''}`}
      />
    </>
  );
}
