import { usePluginScreen } from '../shared/plugin-log';
import { robotMoveLabel, type JsonValue, type RobotMoves } from '@smarteverything/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../components/banner';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import type { Control } from '../../store/control';
import type { Device } from '../../store/state';
import { StreamProblem } from '../shared/plugin-notice';
import { useMoveControl, useRobotMoves, useRobotStatus } from './aibi-data';
import { MoveSheet } from './move-sheet';
import { background } from '@smarteverything/logging';

function Banners({
  talking,
  control,
}: {
  readonly talking: boolean;
  readonly control: Control;
}): ReactNode {
  return (
    <>
      {talking ? null : (
        <Banner
          tone="info"
          title="AIBI can only move while it is talking"
          body="A move is sent with its answer to the next thing it asks this server. Wake it and talk, then choose a move."
        />
      )}
      {control.failure === null ? null : (
        <Banner tone="critical" title="That move was not sent" body={control.failure} wrapBody />
      )}
    </>
  );
}

function MoveList({
  moves,
  control,
  chosen,
  onChoose,
}: {
  readonly moves: RobotMoves;
  readonly control: Control;
  readonly chosen: string | null;
  readonly onChoose: (id: string | null) => void;
}): ReactNode {
  const open = moves.actions.find((move) => move.id === chosen) ?? null;
  const send = (value: JsonValue): void => {
    background(control.set(value), 'control.set_failed');
  };
  return (
    <>
      <List title="Moves" footer={`${String(moves.animations)} animations are allowed too.`}>
        {moves.actions.map((move) => (
          <ListRow
            key={move.id}
            icon="move"
            title={robotMoveLabel(move.id)}
            subtitle={move.description}
            chevron={move.options.length > 0}
            disabled={control.pending}
            onPress={() => {
              if (move.options.length > 0) {
                onChoose(move.id);
              } else {
                send({ action: move.id });
              }
            }}
          />
        ))}
      </List>
      <MoveSheet
        key={open?.id ?? 'none'}
        move={open}
        onClose={() => {
          onChoose(null);
        }}
        onSend={send}
      />
    </>
  );
}

export function MovesSection({ device }: { readonly device: Device }): ReactNode {
  usePluginScreen('aibi', 'MovesSection');
  const moves = useRobotMoves();
  const status = useRobotStatus();
  const control = useMoveControl(device);
  const params = useLocalSearchParams<{ move?: string }>();
  const [chosen, setChosen] = useState<string | null>(params.move ?? null);
  if (moves.state === 'waiting' || status.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (moves.state === 'invalid') {
    return <StreamProblem reason={moves.reason} />;
  }
  if (moves.value.actions.length === 0) {
    return (
      <EmptyState
        icon="move"
        title="No moves are allowed"
        body="Allow some moves in the plugin settings so AIBI can use them."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <Banners talking={status.state === 'ready' && status.value.conversation} control={control} />
      <MoveList moves={moves.value} control={control} chosen={chosen} onChoose={setChosen} />
    </View>
  );
}
