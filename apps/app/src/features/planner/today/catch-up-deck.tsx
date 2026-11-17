import type { PlannerDay, PlannerOccurrenceView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ZoomOut } from 'react-native-reanimated';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import type { AppHref } from '../../../components/app-href';
import { Card } from '../../../components/card';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { SwipeRow, type SwipeAction } from '../../../components/swipe-row';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { entering, exiting, useMotion } from '../../../design/motion';
import { useRow } from '../../../store/selectors';
import { askAssistantWith } from '../../assistant';
import { usePlannerAlarms } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { useInstantClock } from '../../clock/format/clock-format';
import { occurrenceWhenOf } from '../frame/occurrence-list';
import { useItemPress } from '../item/item-menu-host';
import type { ItemOpen } from '../item/selection';
import {
  catchUpCardsOf,
  fitPromptOf,
  ghostStackOf,
  missedAlarmNameOf,
  missedAlarmTitleOf,
  missedReasonOf,
  type AlarmCard,
  type CatchUpCard,
  type GhostStack,
  type ItemCard,
} from './catch-up-model';
import { useTodayActions, type OccurrenceActions } from './today-actions';

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

const STACK_BELOW = 560;
const DECK_MS = 220;
const DONE_MS = 260;

function useDeviceNameOf(occurrence: PlannerOccurrenceView): string | null {
  const attached = occurrence.attachments.find((attachment) => attachment.kind === 'device');
  const device = useRow('devices', attached?.kind === 'device' ? attached.deviceId : null);
  return device?.label ?? null;
}

function DeckButtons({
  card,
  actions,
  stacked,
}: {
  readonly card: ItemCard;
  readonly actions: OccurrenceActions;
  readonly stacked: boolean;
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
          grow={stacked}
          disabled={offline}
          onPress={() => {
            actions[button.action](card.key, card.occurrence);
          }}
        />
      ))}
    </View>
  );
}

type FaceOpen = { readonly href: AppHref } | { readonly onPress: () => void };

function ItemFace({
  card,
  day,
  actions,
  open,
}: {
  readonly card: ItemCard;
  readonly day: PlannerDay;
  readonly actions: OccurrenceActions;
  readonly open: FaceOpen;
}): ReactNode {
  const device = useDeviceNameOf(card.occurrence);
  const measured = useMeasuredWidth();
  const stacked = measured.width < STACK_BELOW;
  const instant = useInstantClock();
  const subtitle = [
    occurrenceWhenOf(card.occurrence, day, instant),
    device,
    card.occurrence.location,
  ]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <View
      onLayout={measured.onLayout}
      className={stacked ? 'gap-3' : 'flex-row items-center gap-3'}
    >
      <Interactive
        {...open}
        label={card.occurrence.title}
        className="min-h-12 min-w-0 flex-1 flex-row items-center gap-3 rounded-sm"
        layerClassName="rounded-sm"
      >
        <IconWell
          icon={card.occurrence.kind === 'event' ? 'calendar' : 'circleCheck'}
          colour="critical"
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label" numberOfLines={2}>
            {card.occurrence.title}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
            {subtitle}
          </Text>
        </View>
      </Interactive>
      <DeckButtons card={card} actions={actions} stacked={stacked} />
    </View>
  );
}

function AlarmFace({
  card,
  day,
}: {
  readonly card: AlarmCard;
  readonly day: PlannerDay;
}): ReactNode {
  const instant = useInstantClock();
  const hubRan =
    card.ring.missed_reason !== 'hub_down' && (card.alarm?.wake_automation_id ?? null) !== null;
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Badge label={missedAlarmTitleOf(card, day, instant)} tone="critical" icon="alarmClock" />
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {missedReasonOf(card.ring)}
        </Text>
      </View>
      <Text variant="label">{card.alarm?.label ?? 'Alarm'}</Text>
      {hubRan ? (
        <Text variant="caption" tone="variant">
          Your wake routine still ran from the hub.
        </Text>
      ) : null}
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
  readonly onPress: (() => void) | undefined;
}

function faceOpenOf(onFan: (() => void) | undefined, open: ItemOpen): FaceOpen {
  if (onFan !== undefined) return { onPress: onFan };
  return 'href' in open ? { href: open.href } : { onPress: open.onPress };
}

function ItemDeckCard({
  card,
  day,
  actions,
  onPress,
}: CardProps & { readonly card: ItemCard }): ReactNode {
  const { offline } = usePlannerFrame();
  const press = useItemPress(card.occurrence.item_id, card.occurrence.occurrence_key);
  const swipe = (action: 'done' | 'skip'): SwipeAction | undefined =>
    offline
      ? undefined
      : {
          ...SWIPES[action],
          onCommit: (): void => {
            actions[action](card.key, card.occurrence);
          },
        };
  const open = faceOpenOf(onPress, press.open);
  return (
    <SwipeRow surface="bg" leading={swipe('done')} trailing={swipe('skip')}>
      <Card>
        <ItemFace card={card} day={day} actions={actions} open={open} />
      </Card>
    </SwipeRow>
  );
}

function DeckCard(props: CardProps): ReactNode {
  const { card } = props;
  if (card.kind === 'alarm') {
    return (
      <Card tone="critical">
        <AlarmFace card={card} day={props.day} />
      </Card>
    );
  }
  return <ItemDeckCard {...props} card={card} />;
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
  const alarms = cards.some((card) => card.kind === 'alarm');
  return (
    <View className="gap-1">
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
              askAssistantWith(prompt);
            }}
          />
        )}
      </View>
      {alarms ? (
        <Text variant="caption" tone="variant">
          Clock doesn’t ring alarms late, so a missed alarm stays marked missed.
        </Text>
      ) : null}
    </View>
  );
}

function MoreButton({
  cards,
  fanned,
  day,
  onPress,
}: {
  readonly cards: readonly CatchUpCard[];
  readonly fanned: boolean;
  readonly day: PlannerDay;
  readonly onPress: () => void;
}): ReactNode {
  const next = cards[1];
  const instant = useInstantClock();
  if (next === undefined) return null;
  const title =
    next.kind === 'item' ? next.occurrence.title : missedAlarmNameOf(next, day, instant);
  return (
    <View className="flex-row">
      <Button
        label={fanned ? 'Show less' : `${String(cards.length - 1)} more · ${title}`}
        icon={fanned ? 'chevronUp' : 'chevronDown'}
        variant="text"
        wrap
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
          <DeckCard card={card} day={day} actions={actions} onPress={onFan} />
        </Animated.View>
      ))}
    </Animated.View>
  );
}

export function CatchUpDeck({ day }: { readonly day: PlannerDay }): ReactNode {
  const { person } = usePlannerFrame();
  const { hidden, actions } = useTodayActions();
  const [open, setOpen] = useState(false);
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
      <MoreButton cards={cards} fanned={fanned} day={day} onPress={toggle} />
    </View>
  );
}
