import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { isVacuumTaskPhase, vacuumPhase, type HomeMapLookPref } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';
import { PREFS, prefValueOf, savePref } from '../../../store/prefs';
import { sameJson } from '../../../store/same-json';
import { useDevices } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { useVacuum } from '../../devices';
import {
  type BlankMap,
  NoMapEntry,
  type NoMapRobot,
  robotMapsHref,
  useRobotMapFeeds,
} from '../../home-map';

const log = new Logger('app.home');

interface HeroLook {
  readonly look: HomeMapLookPref;
  readonly hide: () => void;
}

export function useHeroLook(): HeroLook {
  const store = useEntityStore();
  const look = useStoreSelector((state) => prefValueOf(state, PREFS.homeMapLook), sameJson);
  return {
    look,
    hide: (): void => {
      log.info('hero.hidden');
      savePref(store, PREFS.homeMapLook, { ...look, showOnHome: false });
    },
  };
}

interface NoMapProps {
  readonly map: BlankMap | null;
  readonly menu: readonly MenuItem[];
}

function RobotNoMap({ vacuum, map, menu }: NoMapProps & { readonly vacuum: Device }): ReactNode {
  const router = useRouter();
  const { snapshot } = useVacuum(vacuum);
  const feeds = useRobotMapFeeds() ?? [];
  const robot: NoMapRobot = {
    unfedMaps: feeds.some((feed) => feed.deviceId === vacuum.id && feed.target === null),
    working: isVacuumTaskPhase(vacuumPhase(snapshot.values)),
    onImport: (): void => {
      router.push(robotMapsHref());
    },
    onQuickMapping: (): void => {
      router.push(href.device(vacuum));
    },
  };
  return <NoMapEntry map={map} robot={robot} menu={menu} />;
}

export function HeroNoMap({ map, menu }: NoMapProps): ReactNode {
  const vacuum = useDevices().find((device) => device.kind === 'vacuum') ?? null;
  return vacuum === null ? (
    <NoMapEntry map={map} menu={menu} />
  ) : (
    <RobotNoMap vacuum={vacuum} map={map} menu={menu} />
  );
}
