import { emojiOf, type AssistantReaction, type AssistantMessageRow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { Text as Glyph, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { EmojiPicker } from '../../../components/emoji-picker';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Sheet, type SheetProps } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { SPRING, entering, useMotion } from '../../../design/motion';
import { useReactionToggle } from '../data/message-reactions';
import { QUICK_REACTIONS } from '../model/message-actions';
import { readableText } from '@smarteverything/domain/markdown';

export function reactionGroupsOf(
  reactions: readonly AssistantReaction[],
): readonly (readonly [string, readonly AssistantReaction[]])[] {
  const groups = new Map<string, AssistantReaction[]>();
  for (const member of reactions) {
    const group = groups.get(member.emoji);
    if (group === undefined) groups.set(member.emoji, [member]);
    else group.push(member);
  }
  return [...groups];
}

function ownEmoji(reactions: readonly AssistantReaction[], profileId: string): ReadonlySet<string> {
  return new Set(
    reactions
      .filter(({ actor }) => actor.kind === 'person' && actor.id === profileId)
      .map(({ emoji }) => emoji),
  );
}

export interface MessageReactionModel {
  readonly pending: ReadonlySet<string>;
  readonly members: readonly AssistantReaction[];
  readonly own: ReadonlySet<string>;
  readonly toggle: (emoji: string) => void;
}

const NO_EMOJI: ReadonlySet<string> = new Set();

export function useMessageReactions(
  row: AssistantMessageRow,
  profileId: string | null,
): MessageReactionModel {
  const { pending, members, change } = useReactionToggle(row);
  const own = profileId === null || members.length === 0 ? NO_EMOJI : ownEmoji(members, profileId);
  return {
    pending,
    members,
    own,
    toggle: (emoji): void => {
      change(emoji, !own.has(emoji));
    },
  };
}

interface ReactionProps {
  readonly model: MessageReactionModel;
  readonly enabled: boolean;
  readonly align: 'start' | 'end';
}

export function MessageReactions({ model, enabled, align }: ReactionProps): ReactNode {
  const [details, setDetails] = useState(false);
  const groups = reactionGroupsOf(model.members);
  const [shown] = useState<ReadonlySet<string>>(() => new Set(groups.map(([emoji]) => emoji)));
  if (groups.length === 0) return null;
  return (
    <View className={cn('mt-1.5 flex-row flex-wrap gap-1', align === 'end' ? 'justify-end' : null)}>
      {groups.map(([emoji, reactions]) => (
        <ReactionChip
          key={emoji}
          emoji={emoji}
          count={reactions.length}
          selected={model.own.has(emoji)}
          disabled={!enabled || model.pending.has(emoji)}
          pop={!shown.has(emoji)}
          onPress={model.toggle}
          onDetails={() => {
            setDetails(true);
          }}
        />
      ))}
      {details ? (
        <ReactionDetails
          members={model.members}
          onClose={() => {
            setDetails(false);
          }}
        />
      ) : null}
    </View>
  );
}

const POP = ZoomIn.springify().damping(SPRING.damping).stiffness(SPRING.stiffness);

function reactionLabel(emoji: string, count: number, selected: boolean): string {
  const name = emojiOf(emoji)?.name ?? emoji;
  const countLabel = count === 1 ? '1 reaction' : `${String(count)} reactions`;
  return `${name}, ${countLabel}${selected ? ', including you' : ''}`;
}

function reactionHint(selected: boolean): string {
  return `${selected ? 'Remove reaction' : 'Add reaction'}. Long press shows who reacted`;
}

function chipClass(selected: boolean): string {
  return cn(
    'h-5.5 flex-row items-center gap-1 rounded-full px-1.75',
    selected ? 'bg-primary/18' : 'bg-surface-2',
  );
}

function ReactionChip({
  emoji,
  count,
  selected,
  disabled,
  pop,
  onPress,
  onDetails,
}: {
  readonly emoji: string;
  readonly count: number;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly pop: boolean;
  readonly onPress: (emoji: string) => void;
  readonly onDetails: () => void;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View {...(pop ? entering(motion, POP) : {})}>
      <Interactive
        label={reactionLabel(emoji, count, selected)}
        hint={reactionHint(selected)}
        selected={selected}
        disabled={disabled}
        hitSlop={6}
        onPress={() => {
          onPress(emoji);
        }}
        onLongPress={onDetails}
        className={chipClass(selected)}
        layerClassName="rounded-full"
      >
        <Glyph aria-hidden className="font-sans text-caption">
          {emoji}
        </Glyph>
        <Text
          variant="caption"
          tone={selected ? 'primary' : 'variant'}
          aria-hidden
          className={cn('tabular', selected ? 'font-sans-semibold' : null)}
        >
          {count}
        </Text>
      </Interactive>
    </Animated.View>
  );
}

function ReactionDetails({
  members,
  onClose,
}: {
  readonly members: readonly AssistantReaction[];
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open onClose={onClose} title="Reactions" detents={['fit', 'full']}>
      {members.map(({ emoji, actor }) => (
        <Text
          key={`${emoji}:${actor.kind}:${actor.id}`}
          accessibilityLabel={`${emojiOf(emoji)?.name ?? emoji}, ${actor.label}`}
        >
          {emoji} {actor.label}
        </Text>
      ))}
    </Sheet>
  );
}

export function QuickReactions({
  model,
  close,
  onMore,
}: {
  readonly model: MessageReactionModel;
  readonly close: () => void;
  readonly onMore: () => void;
}): ReactNode {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="React"
      className="h-11 flex-row items-center justify-between self-start rounded-full border-hairline border-outline-variant bg-chrome px-2 elevation-3"
    >
      {QUICK_REACTIONS.map((emoji) => (
        <QuickReaction
          key={emoji}
          emoji={emoji}
          selected={model.own.has(emoji)}
          disabled={model.pending.has(emoji)}
          onPress={() => {
            close();
            model.toggle(emoji);
          }}
        />
      ))}
      <Interactive
        label="More reactions"
        onPress={() => {
          close();
          onMore();
        }}
        className="ml-1 size-7.5 items-center justify-center rounded-full bg-surface-2"
        layerClassName="rounded-full"
      >
        <Icon name="plus" size={16} tone="variant" />
      </Interactive>
    </View>
  );
}

function QuickReaction({
  emoji,
  selected,
  disabled,
  onPress,
}: {
  readonly emoji: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={emojiOf(emoji)?.name ?? emoji}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'size-9 items-center justify-center rounded-full',
        selected ? 'bg-primary/18' : null,
      )}
      layerClassName="rounded-full"
    >
      <Glyph aria-hidden className="font-sans text-title-2">
        {emoji}
      </Glyph>
    </Interactive>
  );
}

export function MessageReactionPicker({
  row,
  speakerName,
  model,
  onClose,
  onComplete = onClose,
  subpage,
}: {
  readonly row: AssistantMessageRow;
  readonly speakerName: string;
  readonly model: MessageReactionModel;
  readonly onClose: () => void;
  readonly onComplete?: () => void;
  readonly subpage?: SheetProps['subpage'];
}): ReactNode {
  const excerpt = readableText(row.text).replace(/\s+/gu, ' ').trim();
  return (
    <EmojiPicker
      title="React to message"
      preview={excerpt === '' ? speakerName : `${speakerName} · ${excerpt}`}
      selected={model.own}
      unavailable={model.pending}
      onClose={onClose}
      subpage={subpage}
      onSelect={(emoji) => {
        onComplete();
        model.toggle(emoji);
      }}
    />
  );
}
