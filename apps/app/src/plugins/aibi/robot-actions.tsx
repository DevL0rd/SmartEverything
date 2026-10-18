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
import type { Control } from '../../store/control';
import type { Device } from '../../store/state';
import { useMoveControl } from './aibi-data';
import { moveIcon } from './move-icons';
import { quickMoves } from './move-model';

function useSendMove(device: Device): {
  readonly control: Control;
  readonly send: (value: JsonValue) => void;
} {
  const control = useMoveControl(device);
  return {
    control,
    send: (value): void => {
      background(control.set(value), 'control.set_failed');
    },
  };
}

export function QuickMoveButton({
  device,
  move,
}: {
  readonly device: Device;
  readonly move: RobotMove;
}): ReactNode {
  const { control, send } = useSendMove(device);
  return (
    <Button
      label={robotMoveLabel(move.id)}
      icon={moveIcon(move.id)}
      variant="tonal"
      disabled={control.pending}
      onPress={() => {
        send({ action: move.id });
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
}: {
  readonly device: Device;
  readonly moves: RobotMoves;
}): ReactNode {
  const router = useRouter();
  const { control, send } = useSendMove(device);
  const { ref, open, menu } = useAnchoredMenu(
    menuItems(
      device,
      moves,
      (to) => {
        router.push(to);
      },
      send,
    ),
    'Moves',
  );
  return (
    <View ref={ref} collapsable={false}>
      <Button
        label="Moves"
        icon="chevronDown"
        variant="tonal"
        disabled={control.pending}
        onPress={open}
      />
      {menu}
    </View>
  );
}

export function MoveFailure({ device }: { readonly device: Device }): ReactNode {
  const { control } = useSendMove(device);
  return control.failure === null ? null : (
    <Text variant="caption" tone="critical" numberOfLines={1}>
      That move was not sent
    </Text>
  );
}

export function cardActions(device: Device, moves: RobotMoves | null): readonly ReactNode[] {
  if (moves === null) {
    return [];
  }
  const [first] = quickMoves(moves.actions, 1);
  return [
    first === undefined ? null : <QuickMoveButton key="quick" device={device} move={first} />,
    moves.actions.length === 0 ? null : (
      <MovesMenuButton key="menu" device={device} moves={moves} />
    ),
  ].filter((action) => action !== null);
}
