import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  HOME_MAP_WALL_KINDS,
  homeMapWallLength,
  homeMapWallPointAt,
  type HomeMapOpening,
  type HomeMapWall,
} from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { OPENING_KINDS, OpeningsPanel } from '../tools/openings-panel';
import {
  INITIAL_WALLS_OPENINGS,
  openingTap,
  removeWallOps,
  type OpeningKind,
  type WallsOpeningsContext,
  type WallKind,
} from '../tools/walls-openings-model';
import { CmField, ListItem, PointFields, ShapeThumb, metres } from './list-parts';
import {
  NOT_APPLIED_TEXT,
  applyOne,
  wallEndOp,
  wallLengthOp,
  wallUpdate,
  type ListEditContext,
} from './rooms-walls-model';

const MIN_THICKNESS_M = 0.01;
const MIN_LENGTH_M = 0.01;

export const WALL_KIND_LABEL: Readonly<Record<WallKind, string>> = {
  solid: 'Solid',
  half: 'Half',
  glass: 'Glass',
  railing: 'Railing',
};

const ADD_KINDS: readonly OpeningKind[] = ['door', 'window'];

export interface OpenState {
  readonly openingId: string | null;
  readonly onOpening: (id: string | null) => void;
}

export function wallSubtitle(wall: HomeMapWall, openings: number): string {
  const parts = [
    metres(homeMapWallLength(wall)),
    `${String(Math.round(wall.thickness * 100))} cm thick`,
    WALL_KIND_LABEL[wall.kind],
    `${String(openings)} ${openings === 1 ? 'opening' : 'openings'}`,
  ];
  return parts.join(' · ');
}

export function openingLabel(opening: Pick<HomeMapOpening, 'kind'>): string {
  return OPENING_KINDS.find((kind) => kind.value === opening.kind)?.label ?? opening.kind;
}

function Shape({
  context,
  wall,
}: {
  readonly context: ListEditContext;
  readonly wall: HomeMapWall;
}): ReactNode {
  const floorId = context.floor.id;
  return (
    <View className="gap-3">
      <Segmented
        label="Wall kind"
        fill
        value={wall.kind}
        disabled={context.readOnly}
        options={HOME_MAP_WALL_KINDS.map((kind) => ({ value: kind, label: WALL_KIND_LABEL[kind] }))}
        onChange={(kind): void => {
          context.apply([wallUpdate(floorId, wall.id, { kind })]);
        }}
      />
      <CmField
        label="Thickness"
        value={wall.thickness}
        min={MIN_THICKNESS_M}
        disabled={context.readOnly}
        onChange={(thickness): void => {
          context.apply([wallUpdate(floorId, wall.id, { thickness })]);
        }}
      />
      <CmField
        label="Length"
        value={homeMapWallLength(wall)}
        min={MIN_LENGTH_M}
        disabled={context.readOnly}
        onChange={(length): void => {
          applyOne(context, wallLengthOp(floorId, wall, length));
        }}
      />
    </View>
  );
}

function Ends({
  context,
  wall,
}: {
  readonly context: ListEditContext;
  readonly wall: HomeMapWall;
}): ReactNode {
  const floorId = context.floor.id;
  return (
    <View className="gap-3">
      <PointFields
        label="Start"
        point={wall.from}
        disabled={context.readOnly}
        onChange={(point): void => {
          applyOne(context, wallEndOp(floorId, wall, 'from', point));
        }}
      />
      <PointFields
        label="End"
        point={wall.to}
        disabled={context.readOnly}
        onChange={(point): void => {
          applyOne(context, wallEndOp(floorId, wall, 'to', point));
        }}
      />
    </View>
  );
}

function openingContext(
  context: ListEditContext,
  opening: HomeMapOpening,
  open: OpenState,
): WallsOpeningsContext {
  return {
    mode: 'openings',
    floor: context.floor,
    state: { ...INITIAL_WALLS_OPENINGS, picked: { kind: 'opening', id: opening.id } },
    dispatch: (event): void => {
      if (event.type === 'pick' && event.picked === null) open.onOpening(null);
    },
    edit: context.apply,
    readOnly: context.readOnly,
  };
}

function AddOpenings({
  context,
  wall,
  open,
}: {
  readonly context: ListEditContext;
  readonly wall: HomeMapWall;
  readonly open: OpenState;
}): ReactNode {
  const add = (kind: OpeningKind): void => {
    const middle = homeMapWallPointAt(wall, homeMapWallLength(wall) / 2);
    const tap = openingTap(context.floor, middle, kind, () => randomUUID());
    if (tap.kind === 'add') {
      context.apply([tap.op]);
      open.onOpening(tap.id);
    } else if (tap.kind === 'pick') {
      open.onOpening(tap.id);
    } else if (tap.kind === 'short') {
      context.notify(`This wall has no free ${metres(tap.width)} space for it.`);
    } else {
      context.notify(NOT_APPLIED_TEXT);
    }
  };
  return (
    <View className="flex-row flex-wrap gap-2">
      {ADD_KINDS.map((kind) => (
        <Button
          key={kind}
          label={`Add a ${openingLabel({ kind }).toLowerCase()}`}
          icon={kind === 'door' ? 'door' : 'square'}
          variant="outlined"
          grow
          disabled={context.readOnly}
          onPress={(): void => {
            add(kind);
          }}
        />
      ))}
    </View>
  );
}

function Openings({
  context,
  wall,
  open,
}: {
  readonly context: ListEditContext;
  readonly wall: HomeMapWall;
  readonly open: OpenState;
}): ReactNode {
  const openings = context.floor.openings
    .filter((opening) => opening.wallId === wall.id)
    .sort((a, b) => a.offset - b.offset);
  return (
    <View className="gap-2">
      <Text variant="body-strong">Doors and windows</Text>
      {openings.map((opening) => (
        <ListItem
          key={opening.id}
          title={openingLabel(opening)}
          subtitle={`${metres(opening.width)} wide · ${metres(opening.offset)} from the start`}
          thumb={
            <Icon name={opening.kind === 'window' ? 'square' : 'door'} size={20} tone="variant" />
          }
          open={open.openingId === opening.id}
          onToggle={(): void => {
            open.onOpening(open.openingId === opening.id ? null : opening.id);
          }}
        >
          <OpeningsPanel context={openingContext(context, opening, open)} />
        </ListItem>
      ))}
      <AddOpenings context={context} wall={wall} open={open} />
    </View>
  );
}

export function WallItem({
  context,
  wall,
  title,
  open,
  onToggle,
  openings,
}: {
  readonly context: ListEditContext;
  readonly wall: HomeMapWall;
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly openings: OpenState;
}): ReactNode {
  const count = context.floor.openings.filter((opening) => opening.wallId === wall.id).length;
  return (
    <ListItem
      title={title}
      subtitle={wallSubtitle(wall, count)}
      thumb={<ShapeThumb points={[wall.from, wall.to]} closed={false} />}
      open={open}
      onToggle={onToggle}
    >
      <Shape context={context} wall={wall} />
      <Ends context={context} wall={wall} />
      <Openings context={context} wall={wall} open={openings} />
      <Button
        label="Delete this wall and its openings"
        icon="trash"
        variant="destructive"
        disabled={context.readOnly}
        onPress={(): void => {
          context.apply(removeWallOps(context.floor, wall.id));
        }}
      />
    </ListItem>
  );
}
