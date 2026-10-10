import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow, CallTurn } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { callTitleOf, callTurnsOf } from '../data/call-transcript';
import { WorkSummary } from './work-summary';

type Segment =
  | { readonly kind: 'say'; readonly turn: CallTurn }
  | { readonly kind: 'tools'; readonly turns: readonly CallTurn[] };

function segmentsOf(turns: readonly CallTurn[]): readonly Segment[] {
  return turns.reduce<Segment[]>((all, turn) => {
    const last = all.at(-1);
    if (turn.who !== 'tool') {
      return [...all, { kind: 'say', turn }];
    }
    if (last?.kind === 'tools') {
      return [...all.slice(0, -1), { kind: 'tools', turns: [...last.turns, turn] }];
    }
    return [...all, { kind: 'tools', turns: [turn] }];
  }, []);
}

function SegmentView({
  segment,
  index,
}: {
  readonly segment: Segment;
  readonly index: number;
}): ReactNode {
  if (segment.kind === 'tools') {
    return (
      <WorkSummary
        live={false}
        steps={segment.turns.map((turn, step) => ({
          key: `${String(index)}-${String(step)}`,
          title: turn.ok || turn.detail === null ? turn.text : `${turn.text}: ${turn.detail}`,
          state: turn.ok ? 'done' : 'failed',
        }))}
      />
    );
  }
  const mine = segment.turn.who === 'person';
  return (
    <View className={mine ? 'items-end pl-12 medium:pl-24' : 'w-full'}>
      <View className={mine ? 'max-w-full rounded-xl bg-surface-3 px-4 py-2.5' : 'w-full'}>
        <Text variant="body" selectable>
          {segment.turn.text}
        </Text>
      </View>
    </View>
  );
}

export function CallBubble({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const [open, setOpen] = useState(false);
  const turns = callTurnsOf(row);
  return (
    <View className="w-full gap-3">
      <Interactive
        label={open ? 'Hide call transcript' : 'Show call transcript'}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min flex-row items-center gap-3 self-start rounded-xl border-hairline border-outline-variant bg-surface-2 px-4 py-2.5"
        layerClassName="rounded-xl"
      >
        <Icon name="phone" size={20} tone="primary" />
        <Text variant="label">{callTitleOf(row)}</Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
      </Interactive>
      {open
        ? segmentsOf(turns).map((segment, index) => (
            <SegmentView key={String(index)} segment={segment} index={index} />
          ))
        : null}
    </View>
  );
}
