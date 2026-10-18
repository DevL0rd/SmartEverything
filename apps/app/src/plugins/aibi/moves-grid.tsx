import type { RobotMoves, RobotStatus } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Grid } from '../../components/grid';
import { Text } from '../../components/text';
import type { Device } from '../../store/state';
import { QuickMoveButton } from './robot-actions';
import { quickMoves } from './move-model';

const GRID_MOVES = 8;
const MIN_WIDTH = 150;
const SLEEPING = 'Moves wait until AIBI wakes up.';
const IDLE = 'Moves are sent with AIBI’s next answer.';
const TALKING = 'Tap a move and AIBI does it.';

export function gridCaption(status: RobotStatus, asleep: boolean): string {
  if (asleep) {
    return SLEEPING;
  }
  return status.conversation ? TALKING : IDLE;
}

export function MovesGrid({
  device,
  moves,
  status,
  asleep,
}: {
  readonly device: Device;
  readonly moves: RobotMoves;
  readonly status: RobotStatus;
  readonly asleep: boolean;
}): ReactNode {
  const shown = quickMoves(moves.actions, GRID_MOVES);
  return (
    <Card title="Moves" icon="move">
      <Text variant="footnote" tone="variant">
        {gridCaption(status, asleep)}
      </Text>
      {asleep ? null : (
        <Grid minItemWidth={MIN_WIDTH} gap="tight">
          {shown.map((move) => (
            <QuickMoveButton key={move.id} device={device} move={move} />
          ))}
        </Grid>
      )}
      <Button
        label="All moves"
        variant="text"
        icon="chevronRight"
        href={href.deviceSection(device.id, 'moves')}
      />
    </Card>
  );
}
