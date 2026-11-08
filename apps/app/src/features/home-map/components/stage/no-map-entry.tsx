import type { ReactNode } from 'react';
import type { HomeMapId } from '@smarteverything/domain';
import { useDevices } from '../../../../store/selectors';
import type { MenuItem } from '../../../../components/menu';
import { NoMapState, type NoMapRobot } from './no-map-state';
import { useCreateMap } from '../../model/create-map';

export interface BlankMap {
  readonly id: HomeMapId;
  readonly name: string;
}

interface MapRooms {
  readonly floors: readonly { readonly rooms: readonly unknown[] }[];
}

export function mapIsBlank(map: MapRooms | null): boolean {
  return map?.floors.every((floor) => floor.rooms.length === 0) === true;
}

export interface NoMapEntryProps {
  readonly map: BlankMap | null;
  readonly robot?: NoMapRobot | undefined;
  readonly menu?: readonly MenuItem[] | undefined;
  readonly className?: string | undefined;
}

export function NoMapEntry({ map, robot, menu, className }: NoMapEntryProps): ReactNode {
  const create = useCreateMap(map?.id);
  const hasVacuum = useDevices().some((device) => device.kind === 'vacuum');
  return (
    <NoMapState
      mapName={map?.name ?? null}
      hasVacuum={hasVacuum}
      create={create}
      robot={robot}
      menu={menu}
      className={className}
    />
  );
}
