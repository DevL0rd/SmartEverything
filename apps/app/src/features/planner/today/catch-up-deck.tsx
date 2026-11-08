import type {
  PlannerAlarmRow,
  PlannerDay,
  PlannerMissedReason,
  PlannerOccurrenceView,
  PlannerRingRow,
} from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ZoomOut } from 'react-native-reanimated';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { SwipeRow, type SwipeAction } from '../../../components/swipe-row';
import { Text } from '../../../components/text';
import { entering, exiting, useMotion } from '../../../design/motion';
import { useAreaWidth } from '../../../design/size-class';
import { clock } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { openQuickAskWith } from '../../assistant';
import { usePlannerAlarms } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { occurrenceWhenOf } from '../frame/occurrence-list';
import { frameLayoutOf } from '../frame/sections';
import { byTime } from './done-ribbon';
import { useHiddenKeys, useOccurrenceActions, type OccurrenceActions } from './now-lens';

export type CatchUpCard =
  | {
      readonly kind: 'item';
      readonly key: string;
      readonly at: number;
      readonly occurrence: PlannerOccurrenceView;
    }
  | {
      readonly kind: 'alarm';
      readonly key: string;
      readonly at: number;
      readonly ring: PlannerRingRow;
      readonly alarm: PlannerAlarmRow | null;
    };

type ItemCard = Extract<CatchUpCard, { readonly kind: 'item' }>;
type AlarmCard = Extract<CatchUpCard, { readonly kind: 'alarm' }>;

const MISSED_REASON: Readonly<Record<PlannerMissedReason, string>> = {
  hub_down: 'hub was off',
  phone_off: 'phone was off',
  computer_asleep: 'computer was asleep',
};

const GHOST = { inset: 12, offset: 7, spread: 96 } as const;

const DECK_BUTTONS: readonly {
  readonly action: keyof OccurrenceActions;
  readonly label: string;
  readonly icon?: IconName;
  readonly variant: 'tonal' | 'outlined';
}[] = [
  { action: 'done', label: 'Done', icon: 'check', variant: 'tonal' },
  { action: 'skip', label: 'Skip', variant: 'outlined' },
  { action: 'later', label: 'Later', icon: 'arrowRight', variant: 'outlined' },
];

const SWIPES = {
  done: { label: 'Done', icon: 'check', tone: 'primary' },
  skip: { label: 'Skip', icon: 'skipForward', tone: 'neutral' },
} as const;

const DECK_MS = 220;
const DONE_MS = 260;

function missedAt(occurrence: PlannerOccurrenceView): number {
  const at = occurrence.start ?? occurrence.due_at;
  return at === null ? Number.POSITIVE_INFINITY : Date.parse(at);
}

function missedAlarm(ring: PlannerRingRow): boolean {
  return ring.kind === 'alarm' && ring.outcome === 'missed';
}

export function catchUpCardsOf(
  day: PlannerDay,
  alarms: readonly PlannerAlarmRow[],
  hidden: ReadonlySet<string>,
): readonly CatchUpCard[] {
  const alarmById = new Map(alarms.map((alarm) => [alarm.id, alarm]));
  const cards: CatchUpCard[] = [
    ...day.missed.map((occurrence) => ({
      kind: 'item' as const,
      key: `item:${occurrence.item_id}:${occurrence.occurrence_key}`,
      at: missedAt(occurrence),
      occurrence,
    })),
    ...day.rings.filter(missedAlarm).map((ring) => ({
      kind: 'alarm' as const,
      key: `alarm:${ring.id}`,
      at: Date.parse(ring.due_at),
      ring,
      alarm: alarmById.get(ring.ref_id) ?? null,
    })),
  ];
  return cards.filter((card) => !hidden.has(card.key)).sort(byTime);
}

export interface GhostCard {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

export interface GhostStack {
  readonly ghosts: readonly GhostCard[];
  readonly pad: { readonly paddingBottom: number };
}

export function ghostStackOf(count: number): GhostStack {
  const ghosts = Math.max(0, count - 1);
  const room = Math.max(1, ghosts);
  const inset = Math.min(GHOST.inset, GHOST.spread / room);
  const offset = Math.min(GHOST.offset, GHOST.spread / 2 / room);
  return {
    ghosts: Array.from({ length: ghosts }, (_, index) => ({
      left: inset * (index + 1),
      right: inset * (index + 1),
      bottom: offset * (ghosts - 1 - index),
    })),
    pad: { paddingBottom: offset * ghosts },
  };
}

export function fitPromptOf(cards: readonly CatchUpCard[]): string | null {
  const titles = cards.flatMap((card) => (card.kind === 'item' ? [card.occurrence.title] : []));
  if (titles.length === 0) return null;
  return `Fit what I missed into the rest of today: ${titles.join(', ')}.`;
}

export function missedAlarmTitleOf(card: AlarmCard, timeZone: string): string {
  return `Missed alarm ${clock(card.ring.due_at, timeZone)}`;
}

export function missedReasonOf(ring: PlannerRingRow): string {
  return ring.missed_reason === null ? 'did not ring' : MISSED_REASON[ring.missed_reason];
}

function useDeviceNameOf(occurrence: PlannerOccurrenceView): string | null {
  const attached = occurrence.attachments.find((attachment) => attachment.kind === 'device');
  const device = useRow('devices', attached?.kind === 'device' ? attached.deviceId : null);
  return device?.label ?? null;
}

function DeckButtons({
  card,
  actions,
  compact,
}: {
  readonly card: ItemCard;
  readonly actions: OccurrenceActions;
  readonly compact: boolean;
}): ReactNode {
  const { offline } = usePlannerFrame();
  return (
    <View className="flex-row gap-2">
      {DECK_BUTTONS.map((button) => (
        <Button
          key={button.action}
          label={button.label}
          {...(button.icon === undefined ? {} : { icon: button.icon })}
          variant={button.variant}
          grow={compact}
          disabled={offline}
          onPress={() => {
            actions[button.action](card.key, card.occurrence);
          }}
        />
      ))}
    </View>
  );
}

function ItemFace({
  card,
  timeZone,
  actions,
  compact,
}: {
  readonly card: ItemCard;
  readonly timeZone: string;
  readonly actions: OccurrenceActions;
  readonly compact: boolean;
}): ReactNode {
  const device = useDeviceNameOf(card.occurrence);
  const subtitle = [occurrenceWhenOf(card.occurrence, timeZone), device, card.occurrence.location]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <View className={compact ? 'gap-3' : 'flex-row items-center gap-3'}>
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <IconWell
          icon={card.occurrence.kind === 'event' ? 'calendar' : 'circleCheck'}
          colour="critical"
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label" numberOfLines={1}>
            {card.occurrence.title}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
            {subtitle}
          </Text>
        </View>
      </View>
      <DeckButtons card={card} actions={actions} compact={compact} />
    </View>
  );
}

function AlarmFace({
  card,
  timeZone,
}: {
  readonly card: AlarmCard;
  readonly timeZone: string;
}): ReactNode {
  const hubRan =
    card.ring.missed_reason !== 'hub_down' && (card.alarm?.wake_scene_id ?? null) !== null;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Badge label={missedAlarmTitleOf(card, timeZone)} tone="critical" icon="alarmClock" />
        <Text variant="caption" tone="variant">
          {missedReasonOf(card.ring)}
        </Text>
      </View>
      <Text variant="label">{card.alarm?.label ?? 'Alarm'}</Text>
      <Text variant="caption" tone="variant">
        {`Clock doesn’t ring alarms late, so this one is marked missed.${hubRan ? ' Your wake routine still ran from the hub.' : ''}`}
      </Text>
      <View className="flex-row gap-2">
        <Button label="Edit alarm" icon="pencil" variant="outlined" href={href.clock.alarms()} />
      </View>
    </View>
  );
}

interface CardProps {
  readonly card: CatchUpCard;
  readonly day: PlannerDay;
  readonly actions: OccurrenceActions;
  readonly compact: boolean;
  readonly onPress: (() => void) | undefined;
}

function DeckCard({ card, day, actions, compact, onPress }: CardProps): ReactNode {
  const { offline } = usePlannerFrame();
  if (card.kind === 'alarm') {
    return (
      <Card tone="critical">
        <AlarmFace card={card} timeZone={day.time_zone} />
      </Card>
    );
  }
  const swipe = (action: 'done' | 'skip'): SwipeAction | undefined =>
    offline
      ? undefined
      : {
          ...SWIPES[action],
          onCommit: (): void => {
            actions[action](card.key, card.occurrence);
          },
        };
  return (
    <SwipeRow surface="bg" leading={swipe('done')} trailing={swipe('skip')}>
      <Card
        label={card.occurrence.title}
        {...(onPress === undefined
          ? { href: href.planner.item(card.occurrence.item_id) }
          : { onPress })}
      >
        <ItemFace card={card} timeZone={day.time_zone} actions={actions} compact={compact} />
      </Card>
    </SwipeRow>
  );
}

function Ghosts({ stack }: { readonly stack: GhostStack }): ReactNode {
  return [...stack.ghosts]
    .reverse()
    .map((ghost) => (
      <View
        key={`${String(ghost.left)}:${String(ghost.bottom)}`}
        aria-hidden
        pointerEvents="none"
        style={ghost}
        className="absolute h-10 rounded-lg border-hairline border-outline-variant bg-surface-1 opacity-70"
      />
    ));
}

function Header({ cards }: { readonly cards: readonly CatchUpCard[] }): ReactNode {
  const { offline } = usePlannerFrame();
  const prompt = fitPromptOf(cards);
  return (
    <View className="flex-row items-center justify-between gap-2">
      <View className="flex-row items-center gap-2">
        <Text variant="label">Missed</Text>
        <Badge label={String(cards.length)} tone="critical" />
      </View>
      {prompt === null ? null : (
        <Button
          label="Fit into today"
          icon="sparkles"
          variant="tonal"
          disabled={offline}
          onPress={() => {
            openQuickAskWith(prompt);
          }}
        />
      )}
    </View>
  );
}

function MoreButton({
  cards,
  fanned,
  timeZone,
  onPress,
}: {
  readonly cards: readonly CatchUpCard[];
  readonly fanned: boolean;
  readonly timeZone: string;
  readonly onPress: () => void;
}): ReactNode {
  const next = cards[1];
  if (next === undefined) return null;
  const title = next.kind === 'item' ? next.occurrence.title : missedAlarmTitleOf(next, timeZone);
  return (
    <View className="flex-row">
      <Button
        label={fanned ? 'Show less' : `${String(cards.length - 1)} more · ${title}`}
        icon={fanned ? 'chevronUp' : 'chevronDown'}
        variant="text"
        onPress={onPress}
      />
    </View>
  );
}

interface StackProps {
  readonly cards: readonly CatchUpCard[];
  readonly day: PlannerDay;
  readonly actions: OccurrenceActions;
  readonly fanned: boolean;
  readonly onFan: (() => void) | undefined;
}

function Stack({ cards, day, actions, fanned, onFan }: StackProps): ReactNode {
  const motion = useMotion();
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const shown = fanned ? cards : cards.slice(0, 1);
  const stack = ghostStackOf(cards.length);
  return (
    <Animated.View
      {...(motion.reduced ? {} : { layout: LinearTransition.duration(DECK_MS) })}
      className="gap-3"
      style={fanned ? undefined : stack.pad}
    >
      {fanned ? null : <Ghosts stack={stack} />}
      {shown.map((card, index) => (
        <Animated.View
          key={card.key}
          {...(index === 0 ? {} : entering(motion, FadeInDown.duration(DECK_MS)))}
          {...exiting(motion, ZoomOut.duration(DONE_MS))}
        >
          <DeckCard card={card} day={day} actions={actions} compact={compact} onPress={onFan} />
        </Animated.View>
      ))}
    </Animated.View>
  );
}

export function CatchUpDeck({ day }: { readonly day: PlannerDay }): ReactNode {
  const { person } = usePlannerFrame();
  const [hidden, hide] = useHiddenKeys();
  const [open, setOpen] = useState(false);
  const actions = useOccurrenceActions(day, hide);
  const cards = catchUpCardsOf(day, usePlannerAlarms(person), hidden);
  if (cards.length === 0) return null;
  const several = cards.length > 1;
  const fanned = open && several;
  const toggle = (): void => {
    setOpen(!fanned);
  };
  return (
    <View className="gap-2">
      <Header cards={cards} />
      <Stack
        cards={cards}
        day={day}
        actions={actions}
        fanned={fanned}
        onFan={fanned || !several ? undefined : toggle}
      />
      <MoreButton cards={cards} fanned={fanned} timeZone={day.time_zone} onPress={toggle} />
    </View>
  );
}
