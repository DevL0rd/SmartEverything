import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Bars } from '../../../components/charts/bars';
import { Figure } from '../../../components/figure';
import { ListRow } from '../../../components/list-row';
import { Sheet, type SheetProps } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { clock, dayLabel } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';
import { moneyNoteOf, useMoney, type Money } from '../../region';
import { useAiChat, useChatMessages } from '../data/chat-store';
import { mergedRows, useOlderRows } from '../data/history';
import { usePluginNames } from '../data/plugin-names';
import { costBarsOf, NO_COST_REPORTED, replyCostOf, turnTime } from '../model/cost-note';
import { modelIdName } from '../model/model-name';
import { replyTimeline } from '../model/reply-timeline';
import { sourceLabelOf, viaLabelOf } from '../model/speaker';
import { useModelRow } from '../picker/model-queries';
import { isComputerEngine } from '../provider/computer-engine';
import { ChatSubscriptionUsage } from '../provider/subscription-usage';
import { CHAT_SURFACE } from './chat-surface';

interface Stat {
  readonly label: string;
  readonly value: string;
}

function tookOf(row: AssistantMessageRow): string | null {
  if (row.role !== 'responder' || row.state !== 'answered') return null;
  const elapsed = Date.parse(row.updated_at) - Date.parse(row.created_at);
  return elapsed > 0 ? turnTime(elapsed) : null;
}

function toolTitlesOf(row: AssistantMessageRow): readonly string[] {
  const timeline = replyTimeline(row);
  if (timeline === null) return row.steps;
  return timeline.parts.filter((part) => part.kind === 'tool').map((part) => part.tool.title);
}

function subscriptionChat(chat: AiChatRow | null): chat is AiChatRow {
  return chat !== null && isComputerEngine(chat.engine);
}

function costValueOf(row: AssistantMessageRow, money: Money): string | null {
  const cost = replyCostOf(row, null);
  if (cost === null) return null;
  if (cost.kind === 'unreported') return NO_COST_REPORTED;
  const figure = money.cost(cost.micros);
  return cost.kind === 'partial' ? `${figure} + not reported` : figure;
}

function statsOf(row: AssistantMessageRow, money: Money, metered: boolean): readonly Stat[] {
  const cost = metered ? costValueOf(row, money) : null;
  const took = tookOf(row);
  const tools = toolTitlesOf(row).length;
  return [
    ...(cost === null ? [] : [{ label: 'Cost', value: cost === NO_COST_REPORTED ? '–' : cost }]),
    ...(took === null ? [] : [{ label: 'Time', value: took }]),
    ...(tools === 0 ? [] : [{ label: 'Tools', value: String(tools) }]),
  ];
}

function StatTiles({ stats }: { readonly stats: readonly Stat[] }): ReactNode {
  if (stats.length === 0) return null;
  return (
    <View className="flex-row gap-2">
      {stats.map((stat) => (
        <View
          key={stat.label}
          accessible
          accessibilityLabel={`${stat.label} ${stat.value === '–' ? NO_COST_REPORTED : stat.value}`}
          className={`min-w-0 flex-1 basis-0 gap-0.5 p-2.5 ${CHAT_SURFACE}`}
        >
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {stat.label}
          </Text>
          <Figure value={stat.value} size="s" />
        </View>
      ))}
    </View>
  );
}

function DetailRow({
  label,
  values,
  note = null,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly note?: string | null;
}): ReactNode {
  return (
    <View accessible accessibilityLabel={joinParts([label, ...values, note])} className="py-1.25">
      <View className="flex-row gap-3">
        <Text variant="footnote" tone="variant" className="w-24 shrink-0">
          {label}
        </Text>
        <View className="min-w-0 flex-1 items-end gap-0.5">
          {values.map((value, index) => (
            <Text
              key={`${String(index)}-${value}`}
              variant="footnote"
              className="tabular text-right"
            >
              {value}
            </Text>
          ))}
        </View>
      </View>
      {note === null ? null : (
        <Text variant="caption" tone="faint" className="mt-0.5">
          {note}
        </Text>
      )}
    </View>
  );
}

function ModelName({ model }: { readonly model: string }): ReactNode {
  const found = useModelRow(model);
  return (
    <Text variant="caption" tone="faint" numberOfLines={1} className="min-w-0 shrink">
      {found.data?.name ?? modelIdName(model)}
    </Text>
  );
}

function chatTotalOf(chat: AiChatRow | null, money: Money): string | null {
  if (chat === null || (chat.cost_micros === 0 && chat.cost_incomplete !== true)) return null;
  const known = money.cost(chat.cost_micros);
  return chat.cost_incomplete === true ? `${known} + not reported` : known;
}

function CostRows({
  row,
  chat,
  money,
}: {
  readonly row: AssistantMessageRow;
  readonly chat: AiChatRow | null;
  readonly money: Money;
}): ReactNode {
  if (subscriptionChat(chat)) return <ChatSubscriptionUsage chat={chat} />;
  const cost = costValueOf(row, money);
  const total = chatTotalOf(chat, money);
  const priced = cost !== null && cost !== NO_COST_REPORTED;
  return (
    <>
      {total === null ? null : <DetailRow label="Chat total" values={[total]} />}
      {priced ? (
        <DetailRow
          label="Currency"
          values={[money.format.currency]}
          note={moneyNoteOf(money.format)}
        />
      ) : null}
    </>
  );
}

function OriginRow({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const plugins = usePluginNames();
  const source = sourceLabelOf(row, plugins) ?? viaLabelOf(row);
  return source === null ? null : <DetailRow label="Sent" values={[`${source} · ${row.author}`]} />;
}

function TurnChart({
  row,
  money,
}: {
  readonly row: AssistantMessageRow;
  readonly money: Money;
}): ReactNode {
  const live = useChatMessages(row.chat_id);
  const older = useOlderRows(row.chat_id);
  const bars = costBarsOf(mergedRows(live, older));
  if (row.cost_micros === 0 || bars.length === 0) return null;
  return (
    <View className="gap-1.5">
      <Text variant="caption" tone="faint">
        This chat, cost per turn
      </Text>
      <Bars
        bars={bars}
        colour="primary"
        height={28}
        highlightKey={row.id}
        label="Cost per turn in this chat"
        formatValue={money.cost}
      />
    </View>
  );
}

function Heading({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text variant="label" numberOfLines={1} className="shrink-0">
        {joinParts([
          row.role === 'responder' ? 'Reply' : 'Sent',
          dayLabel(row.created_at, now, timeZone),
          clock(row.created_at, timeZone),
        ])}
      </Text>
      {row.model === null ? null : <ModelName model={row.model} />}
    </View>
  );
}

function Body({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const chat = useAiChat(row.chat_id);
  const money = useMoney();
  const metered = !subscriptionChat(chat);
  const tools = toolTitlesOf(row);
  return (
    <View className="gap-3.5 pb-2">
      <Heading row={row} />
      <StatTiles stats={statsOf(row, money, metered)} />
      <View>
        <CostRows row={row} chat={chat} money={money} />
        <OriginRow row={row} />
        {tools.length === 0 ? null : <DetailRow label="Tools" values={tools} />}
      </View>
      {metered ? <TurnChart row={row} money={money} /> : null}
      {metered ? (
        <ListRow
          title="See costs for this chat"
          chevron
          href={href.assistantCosts({ chat: row.chat_id })}
        />
      ) : null}
    </View>
  );
}

export function MessageDetails({
  row,
  open,
  onClose,
  subpage,
}: {
  readonly row: AssistantMessageRow;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly subpage?: SheetProps['subpage'];
}): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Message details"
      detents={['fit']}
      subpage={subpage}
    >
      <Body row={row} />
    </Sheet>
  );
}
