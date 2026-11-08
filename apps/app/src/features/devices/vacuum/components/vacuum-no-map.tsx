import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import type { HomeMapFeed } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../../components/confirm-store';
import { useLedger } from '../../../../store/store-context';
import type { Device } from '../../../../store/state';
import {
  type BlankMap,
  NoMapEntry,
  type NoMapRobot,
  robotMapsHref,
  useRobotMapFeeds,
} from '../../../home-map';
import { useVacuum } from '../data/use-vacuum';

export const VACUUM_BUILD_MAP_ROLE = 'vacuum_build_map';

export function robotHasUnfedMaps(feeds: readonly HomeMapFeed[] | null, deviceId: string): boolean {
  return (feeds ?? []).some((feed) => feed.deviceId === deviceId && feed.target === null);
}

const MAPPING_CONFIRM = {
  title: 'Map with the robot?',
  body: 'The robot drives through every room it can reach and saves what it finds as its map.',
  confirmLabel: 'Start mapping',
} as const;

function useRobotActions(device: Device, working: boolean): NoMapRobot {
  const router = useRouter();
  const ledger = useLedger();
  const key = useVacuum(device).keyOf(VACUUM_BUILD_MAP_ROLE);
  const unfedMaps = robotHasUnfedMaps(useRobotMapFeeds(), device.id);
  const build = async (): Promise<void> => {
    if (key === undefined || !(await confirm(MAPPING_CONFIRM))) return;
    await ledger.send(device, key, null);
  };
  return {
    unfedMaps,
    working: working || key === undefined,
    onImport: (): void => {
      router.push(robotMapsHref());
    },
    onQuickMapping: (): void => {
      background(build(), 'vacuum.command_failed', { deviceId: device.id, capability: key });
    },
  };
}

export interface VacuumNoMapProps {
  readonly device: Device;
  readonly map: BlankMap;
  readonly working: boolean;
}

export function VacuumNoMap({ device, map, working }: VacuumNoMapProps): ReactNode {
  const robot = useRobotActions(device, working);
  return <NoMapEntry map={map} robot={robot} />;
}
