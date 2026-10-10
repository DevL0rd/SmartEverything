import { robotMoveLabel, type RobotMoves, type RobotStatus } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import type { WidgetSize } from '../../components/widget-board';
import { plural } from '../../format/text';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { useMoveControl } from './aibi-data';
import { LINE_WHO, conversationText, lastContactText, lastHeard } from './aibi-text';
import { quickMoves } from './move-model';

const LINES_BY_SIZE: Readonly<Record<WidgetSize, number>> = { S: 0, M: 2, W: 2, L: 4, XL: 6 };
const MOVES_BY_SIZE: Readonly<Record<WidgetSize, number>> = { S: 2, M: 4, W: 6, L: 8, XL: 10 };

function Badges({
  status,
  small,
  online,
}: {
  readonly status: RobotStatus;
  readonly small: boolean;
  readonly online: boolean | null;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {online === null ? null : (
        <Badge label={online ? 'Online' : 'Offline'} tone={online ? 'positive' : 'neutral'} />
      )}
      <Badge label={conversationText(status)} tone={status.conversation ? 'primary' : 'neutral'} />
      {small || status.waiting === 0 ? null : (
        <Badge label={`${plural(status.waiting, 'thing')} to tell`} tone="info" />
      )}
      {small || status.tasks === 0 ? null : (
        <Badge label={`${plural(status.tasks, 'task')} running`} tone="info" />
      )}
    </View>
  );
}

export function StatusBody({
  status,
  size,
  device,
  showOnline,
}: {
  readonly status: RobotStatus;
  readonly size: WidgetSize;
  readonly device: Device | null;
  readonly showOnline: boolean;
}): ReactNode {
  const now = useMinute();
  const firmware = status.robot?.firmware ?? null;
  return (
    <View className="gap-2">
      <Badges
        status={status}
        small={size === 'S'}
        online={showOnline ? device?.online === true : null}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {`Last heard from ${lastContactText(status, now)}`}
      </Text>
      {size === 'S' || firmware === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {`Firmware ${firmware}`}
        </Text>
      )}
    </View>
  );
}

export function ConversationBody({
  status,
  size,
}: {
  readonly status: RobotStatus;
  readonly size: WidgetSize;
}): ReactNode {
  const heard = lastHeard(status);
  const lines = status.lines.slice(-LINES_BY_SIZE[size]);
  if (size === 'S' || lines.length === 0) {
    return (
      <Text variant="footnote" tone="variant" numberOfLines={3}>
        {heard === null ? 'Nothing said yet' : `Heard: ${heard.text}`}
      </Text>
    );
  }
  return (
    <View className="gap-2">
      {lines.map((line) => (
        <Text key={`${line.at}:${line.who}:${line.text}`} variant="footnote" numberOfLines={2}>
          <Text variant="footnote" tone="variant">
            {`${LINE_WHO[line.who]}: `}
          </Text>
          {line.text}
        </Text>
      ))}
    </View>
  );
}

export function QuickMoves({
  moves,
  size,
  device,
}: {
  readonly moves: RobotMoves;
  readonly size: WidgetSize;
  readonly device: Device;
}): ReactNode {
  const control = useMoveControl(device);
  const shown = quickMoves(moves.actions, MOVES_BY_SIZE[size]);
  return (
    <View className="flex-row flex-wrap gap-2">
      {shown.map((move) => (
        <Button
          key={move.id}
          label={robotMoveLabel(move.id)}
          variant="tonal"
          disabled={control.pending}
          onPress={() => {
            void control.set({ action: move.id });
          }}
        />
      ))}
    </View>
  );
}
