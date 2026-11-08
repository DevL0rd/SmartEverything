import {
  robotMoveLabel,
  type RobotLine,
  type RobotMoves,
  type RobotStatus,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { useIdiom } from '../../design/platform';
import { TYPE_SCALE } from '../../design/tokens';
import { plural } from '../../format/text';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { FitBand, FitList } from '../shared/plugin-widget';
import { useMoveControl } from './aibi-data';
import { LINE_WHO, conversationBadge, lastContactText, lastHeard } from './aibi-text';
import { quickMoves } from './move-model';
import { background } from '@smarteverything/logging';

const LINE_GAP = 8;

function Badges({
  status,
  online,
}: {
  readonly status: RobotStatus;
  readonly online: boolean | null;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {online === null ? null : (
        <Badge label={online ? 'Online' : 'Offline'} tone={online ? 'positive' : 'neutral'} />
      )}
      <Badge {...conversationBadge(status)} />
      {status.waiting === 0 ? null : (
        <Badge label={`${plural(status.waiting, 'thing')} to tell`} tone="info" />
      )}
      {status.tasks === 0 ? null : (
        <Badge label={`${plural(status.tasks, 'task')} running`} tone="info" />
      )}
    </View>
  );
}

interface StatusLine {
  readonly key: string;
  readonly text: string;
}

export function statusLines(status: RobotStatus, now: number): readonly StatusLine[] {
  const firmware = status.robot?.firmware ?? null;
  const heard = { key: 'heard', text: `Last heard from ${lastContactText(status, now)}` };
  return firmware === null ? [heard] : [heard, { key: 'firmware', text: `Firmware ${firmware}` }];
}

export function StatusBody({
  status,
  device,
  showOnline,
}: {
  readonly status: RobotStatus;
  readonly device: Device | null;
  readonly showOnline: boolean;
}): ReactNode {
  const now = useMinute();
  const lineHeight = TYPE_SCALE[useIdiom()].footnote[1];
  return (
    <View className="min-h-0 flex-1 gap-2">
      <Badges status={status} online={showOnline ? device?.online === true : null} />
      <FitList
        items={statusLines(status, now)}
        keyOf={(line) => line.key}
        estimate={lineHeight}
        gap={LINE_GAP}
      >
        {(line, room) => {
          const lines = linesFor(room, lineHeight);
          return (
            <Text
              variant="footnote"
              tone="variant"
              {...(lines === undefined ? {} : { numberOfLines: lines })}
            >
              {line.text}
            </Text>
          );
        }}
      </FitList>
    </View>
  );
}

function lineKey(line: RobotLine): string {
  return `${line.at}:${line.who}:${line.text}`;
}

export function linesFor(room: number | null, lineHeight: number): number | undefined {
  return room === null ? undefined : Math.max(1, Math.floor(room / lineHeight));
}

export function ConversationBody({ status }: { readonly status: RobotStatus }): ReactNode {
  const lineHeight = TYPE_SCALE[useIdiom()].footnote[1];
  const heard = lastHeard(status);
  if (status.lines.length === 0) {
    return (
      <Text variant="footnote" tone="variant" numberOfLines={3}>
        {heard === null ? 'Nothing said yet' : `Heard: ${heard.text}`}
      </Text>
    );
  }
  return (
    <FitList
      items={[...status.lines].reverse()}
      keyOf={lineKey}
      estimate={lineHeight}
      gap={LINE_GAP}
      from="end"
    >
      {(line, room) => {
        const lines = linesFor(room, lineHeight);
        return (
          <Text variant="footnote" {...(lines === undefined ? {} : { numberOfLines: lines })}>
            <Text variant="footnote" tone="variant">
              {`${LINE_WHO[line.who]}: `}
            </Text>
            {line.text}
          </Text>
        );
      }}
    </FitList>
  );
}

export function QuickMoves({
  moves,
  device,
}: {
  readonly moves: RobotMoves;
  readonly device: Device;
}): ReactNode {
  const control = useMoveControl(device);
  return (
    <FitBand items={quickMoves(moves.actions, moves.actions.length)} keyOf={(move) => move.id}>
      {(move) => (
        <Button
          label={robotMoveLabel(move.id)}
          variant="tonal"
          disabled={control.pending}
          onPress={() => {
            background(control.set({ action: move.id }), 'control.set_failed');
          }}
        />
      )}
    </FitBand>
  );
}
