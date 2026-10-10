import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow, CallTurn } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { joinParts } from '../../../format/text';
import { useRow } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { callFailuresOf, callTitleOf, callTurnsOf } from '../data/call-transcript';
import { CollapseBody, CollapseRoot, TurnChevron } from './disclosure';

const WAVE = [6, 12, 8, 16, 10, 14, 5, 11] as const;

const heightStyle = (height: number): { readonly height: number } => ({ height });

function Wave(): ReactNode {
  return (
    <View aria-hidden className="h-5 flex-row items-center gap-0.5">
      {WAVE.map((height, index) => (
        <View
          key={String(index)}
          style={heightStyle(height)}
          className="w-0.5 rounded-full bg-positive/70"
        />
      ))}
    </View>
  );
}

function speakerOf(turn: CallTurn, row: AssistantMessageRow): string {
  if (turn.who === 'tool') {
    return 'Tool';
  }
  return turn.who === 'person' ? (row.origin?.name ?? 'You') : row.author;
}

type LineTone = 'critical' | 'primary' | 'variant' | 'default';

function toneOf(turn: CallTurn): { readonly name: LineTone; readonly text: LineTone } {
  if (turn.who === 'tool') {
    return turn.ok ? { name: 'variant', text: 'variant' } : { name: 'critical', text: 'critical' };
  }
  return turn.who === 'person'
    ? { name: 'primary', text: 'default' }
    : { name: 'variant', text: 'default' };
}

function lineText(turn: CallTurn): string {
  return turn.who === 'tool' && !turn.ok && turn.detail !== null
    ? `${turn.text}: ${turn.detail}`
    : turn.text;
}

function TranscriptLine({
  turn,
  row,
}: {
  readonly turn: CallTurn;
  readonly row: AssistantMessageRow;
}): ReactNode {
  const tone = toneOf(turn);
  return (
    <View className="flex-row gap-3">
      <View className="w-20 shrink-0 flex-row items-center gap-1 self-start pt-px">
        {turn.who === 'tool' ? (
          <Icon name={turn.ok ? 'wrench' : 'alert'} size={16} tone={tone.name} />
        ) : null}
        <Text variant="caption" tone={tone.name} numberOfLines={1} className="shrink">
          {speakerOf(turn, row)}
        </Text>
      </View>
      <Text variant="callout" tone={tone.text} selectable className="min-w-0 flex-1">
        {lineText(turn)}
      </Text>
    </View>
  );
}

function Transcript({
  turns,
  row,
}: {
  readonly turns: readonly CallTurn[];
  readonly row: AssistantMessageRow;
}): ReactNode {
  return (
    <View className="gap-3 px-4 pb-2 pt-3">
      <View className="-mx-4 h-px bg-outline-variant" />
      {turns.map((turn, index) => (
        <TranscriptLine key={String(index)} turn={turn} row={row} />
      ))}
    </View>
  );
}

function useCallDetails(row: AssistantMessageRow): {
  readonly camera: boolean;
  readonly text: string;
} {
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const device = useRow('devices', row.origin?.device_id ?? null);
  return {
    camera: device !== null,
    text: joinParts([device?.label ?? row.origin?.name, clock(row.created_at, timeZone)]),
  };
}

function failedText(failures: number): string {
  return failures === 1 ? '1 action failed' : `${String(failures)} actions failed`;
}

export function CallCard({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const [open, setOpen] = useState(false);
  const turns = callTurnsOf(row);
  const failures = callFailuresOf(turns);
  const details = useCallDetails(row);
  const title = callTitleOf(row);
  return (
    <CollapseRoot className="w-full overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
      <Interactive
        label={`${title}, ${open ? 'hide' : 'show'} transcript`}
        checked={open}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min flex-row items-center gap-3 py-2.5 pl-3 pr-4"
      >
        <IconWell icon={details.camera ? 'camera' : 'phone'} colour="primary" />
        <View className="min-w-0 flex-1">
          <Text variant="callout" className="font-sans-medium" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {details.text}
            {failures === 0 ? null : (
              <Text variant="footnote" tone="critical">{` · ${failedText(failures)}`}</Text>
            )}
          </Text>
        </View>
        <Wave />
        <TurnChevron open={open} />
      </Interactive>
      {open ? (
        <CollapseBody>
          <Transcript turns={turns} row={row} />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
