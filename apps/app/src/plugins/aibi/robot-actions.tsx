import {
  robotMoveLabel,
  type JsonValue,
  type RobotMove,
  type RobotMoves,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { useAnchoredMenu, type MenuItem } from '../../components/menu';
import { Text } from '../../components/text';
import type { Device } from '../../store/state';
import { useMoveControl } from './aibi-data';
import { moveIcon } from './move-icons';

export interface Mover {
  readonly pending: boolean;
  readonly failed: boolean;
  readonly send: (value: JsonValue) => void;
}

export function useMover(device: Device): Mover {
  const control = useMoveControl(device);
  return {
    pending: control.pending,
    failed: control.failure !== null,
    send: (value): void => {
      background(control.set(value), 'control.set_failed');
    },
  };
}

export function QuickMoveButton({
  move,
  mover,
}: {
  readonly move: RobotMove;
  readonly mover: Mover;
}): ReactNode {
  return (
    <Button
      label={robotMoveLabel(move.id)}
      icon={moveIcon(move.id)}
      variant="tonal"
      disabled={mover.pending}
      onPress={() => {
        mover.send({ action: move.id });
      }}
    />
  );
}

function menuItems(
  device: Device,
  moves: RobotMoves,
  go: (to: ReturnType<typeof href.deviceSection>) => void,
  send: (value: JsonValue) => void,
): readonly MenuItem[] {
  return moves.actions.map((move) => ({
    label: robotMoveLabel(move.id),
    description: move.description,
    icon: moveIcon(move.id),
    onPress: (): void => {
      if (move.options.length > 0) {
        go(href.deviceSection(device.id, 'moves', { move: move.id }));
      } else {
        send({ action: move.id });
      }
    },
  }));
}

export function MovesMenuButton({
  device,
  moves,
  mover,
}: {
  readonly device: Device;
  readonly moves: RobotMoves;
  readonly mover: Mover;
}): ReactNode {
  const router = useRouter();
  const { ref, open, menu } = useAnchoredMenu(
    menuItems(
      device,
      moves,
      (to) => {
        router.push(to);
      },
      mover.send,
    ),
    'Moves',
  );
  return (
    <View ref={ref} collapsable={false}>
      <Button
        label="Moves"
        icon="chevronDown"
        variant="tonal"
        disabled={mover.pending}
        onPress={open}
      />
      {menu}
    </View>
  );
}

export function MoveFailure({ device }: { readonly device: Device }): ReactNode {
  return useMover(device).failed ? (
    <Text variant="caption" tone="critical" numberOfLines={1}>
      That move was not sent
    </Text>
  ) : null;
}
