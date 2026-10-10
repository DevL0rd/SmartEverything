import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMotion } from '../../../design/motion';
import { Markdown } from '../components/markdown/markdown';
import { TypingDots } from '../components/typing-dots';
import { WorkSummary } from '../components/work-summary';
import type { Turn } from '../../../store/chat-turns';

const FENCE = /^```/gm;

export function splitSettled(text: string): readonly [string, string] {
  const fences = text.match(FENCE)?.length ?? 0;
  const open = fences % 2 === 1 ? text.lastIndexOf('```') : -1;
  const searchEnd = open === -1 ? text.length : open;
  const cut = text.lastIndexOf('\n\n', searchEnd);
  return cut <= 0 ? ['', text] : [text.slice(0, cut), text.slice(cut + 2)];
}

function Reasoning({ text, live }: { readonly text: string; readonly live: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-1">
      <Interactive
        label={open ? 'Hide thinking' : 'Show thinking'}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min flex-row items-center gap-1 self-start rounded-full pr-2"
        layerClassName="rounded-full"
      >
        <Icon name="brain" size={16} tone="variant" />
        <Text variant="caption" tone="variant">
          {live ? 'Thinking…' : 'Thought'}
        </Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
      </Interactive>
      {open ? (
        <View className="border-l-2 border-outline-variant pl-3">
          <Text variant="footnote" tone="variant" selectable>
            {text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Body({ text }: { readonly text: string }): ReactNode {
  const [settled, tail] = splitSettled(text);
  return (
    <View className="gap-2">
      {settled === '' ? null : <Markdown text={settled} />}
      {tail === '' ? null : <Markdown text={tail} />}
    </View>
  );
}

function TurnExtras({ turn }: { readonly turn: Turn }): ReactNode {
  return (
    <>
      {turn.reasoning === '' ? null : (
        <Reasoning text={turn.reasoning} live={turn.state === 'thinking'} />
      )}
      <WorkSummary
        steps={turn.tools.map((tool) => ({
          key: tool.callId,
          title: tool.title,
          state: tool.state,
        }))}
        live={isLive(turn)}
      />
    </>
  );
}

function shownText(turn: Turn | null, fallback: string): string {
  return turn === null || turn.text.length < fallback.length ? fallback : turn.text;
}

function isLive(turn: Turn | null): boolean {
  return turn !== null && turn.state !== 'idle' && turn.state !== 'failed';
}

export function StreamingBubble({
  turn,
  fallback,
}: {
  readonly turn: Turn | null;
  readonly fallback: string;
}): ReactNode {
  const motion = useMotion();
  const text = shownText(turn, fallback);
  return (
    <Animated.View
      {...(motion.reduced ? {} : { layout: LinearTransition.duration(150) })}
      className="w-full gap-2"
    >
      {turn === null ? null : <TurnExtras turn={turn} />}
      {text === '' ? null : <Body text={text} />}
      {turn?.behind === true ? (
        <Text variant="caption" tone="faint">
          Catching up…
        </Text>
      ) : null}
      {isLive(turn) && text === '' ? <TypingDots tone="primary" /> : null}
    </Animated.View>
  );
}
