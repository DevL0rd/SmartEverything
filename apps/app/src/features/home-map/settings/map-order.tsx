import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { IconButton } from '../../../components/icon-button';
import { useHomeMapSetActions, type HomeMapSetOutcome } from '../data/map-set-query';

export interface MapOrder {
  readonly move: (mapId: string, position: number) => void;
  readonly busy: boolean;
  readonly problem: string | null;
}

const MOVE_PROBLEMS: Readonly<Record<'offline' | 'unconfirmed', string>> = {
  offline: 'Connect to the hub to reorder the maps',
  unconfirmed: "Couldn't confirm the new order · Try again",
};

export function moveProblemOf(outcome: HomeMapSetOutcome<unknown>): string | null {
  if (outcome.kind === 'done') return null;
  return outcome.kind === 'refused' ? outcome.message : MOVE_PROBLEMS[outcome.kind];
}

export function useMapOrder(): MapOrder {
  const actions = useHomeMapSetActions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (mapId: string, position: number): Promise<void> => {
    setBusy(true);
    setProblem(null);
    const outcome = await actions.update(mapId, { position });
    setBusy(false);
    setProblem(moveProblemOf(outcome));
  };
  return {
    move: (mapId, position): void => {
      if (!busy) background(run(mapId, position), 'home_map.move_failed');
    },
    busy,
    problem,
  };
}

export interface MapOrderButtonsProps {
  readonly mapId: string;
  readonly name: string;
  readonly index: number;
  readonly count: number;
  readonly order: MapOrder;
}

export function MapOrderButtons({
  mapId,
  name,
  index,
  count,
  order,
}: MapOrderButtonsProps): ReactNode {
  return (
    <View className="justify-center pr-2">
      <IconButton
        icon="chevronUp"
        label={`Move ${name} up`}
        disabled={order.busy || index === 0}
        onPress={(): void => {
          order.move(mapId, index - 1);
        }}
      />
      <IconButton
        icon="chevronDown"
        label={`Move ${name} down`}
        disabled={order.busy || index === count - 1}
        onPress={(): void => {
          order.move(mapId, index + 1);
        }}
      />
    </View>
  );
}
