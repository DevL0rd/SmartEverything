import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { AppHref } from '../../../components/app-href';
import type { HomeMap, HomeMapLookPref, HomeMapStageView } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { StageLiveProps } from '../../../components/house-map/live-visibility/stage-host';
import type { RenderFloor, RenderScene } from '../../../components/house-map/render-scene';
import { cn } from '../../../design/cn';
import { useIsPhone, useSizeClass } from '../../../design/size-class';
import { SEMANTIC_SIZES } from '../../../design/tokens';
import { useSyncStatus } from '../../../store/selectors';
import {
  EmptyFloorRow,
  type HeroRealistic,
  HomeMap3d,
  type HomeMap3dProps,
  type HomeMapLive,
  type HomeMapLiveRequest,
  mapIsBlank,
  Stage,
  stageChromeShown,
  type StageContent,
  type StageContext,
  stageDimmed,
  StageFullScreen,
  stageIdOf,
  type StageMaps,
  stageNotices,
  stageNoticesNode,
  stagePhase,
  type StagePhase,
  StageSkeleton,
  StageStillView,
  type StageViews,
  useChosenHomeMap,
  useHomeMapDemand,
  useHomeMapLive,
  useHomeMapScene,
  useLastFloor,
  useStageLights,
  useStageViews,
} from '../../home-map';
import {
  HERO_PAGE,
  HOME_MAP_EDITOR,
  heroFloorOf,
  heroFrameStyle,
  heroMapNotices,
  heroPickTarget,
  heroTapTarget,
  heroViewFacts,
  madeFromRobot,
} from '../model/hero';
import { HeroNoMap, useHeroLook } from './hero-live';

const log = new Logger('app.home');

const NO_STATE = { unavailable: false } as const;

const UNAVAILABLE_STATE = { unavailable: true } as const;

const NO_FLOORS: readonly RenderFloor[] = [];

const NO_ROOMS: readonly string[] = [];

interface HeroShown {
  readonly map: HomeMap;
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
  readonly look: HomeMapLookPref;
}

interface HeroBodyProps {
  readonly shown: HeroShown;
  readonly view: HomeMapStageView;
  readonly dimmed: boolean;
  readonly context: StageContext;
  readonly live: StageLiveProps;
  readonly realistic: HeroRealistic | undefined;
}

function useHeroGo(): (target: AppHref | null, kind: string) => void {
  const router = useRouter();
  return (target, kind) => {
    if (target === null) return;
    log.info('hero.tap', { kind });
    router.push(target);
  };
}

function useHeroFeed(shown: HeroShown, active: boolean): HomeMapLive {
  const request = useMemo<HomeMapLiveRequest>(
    () => ({ mapName: shown.map.name, animate: active }),
    [shown.map.name, active],
  );
  return useHomeMapLive(shown.map, shown.floor, shown.look, request);
}

interface HeroStillProps {
  readonly shown: HeroShown;
  readonly context: StageContext;
  readonly live: StageLiveProps;
}

function HeroStill({ shown, context, live }: HeroStillProps): ReactNode {
  return (
    <View className="absolute inset-0" onLayout={live.onReady}>
      <StageStillView
        input={{ floor: shown.floor }}
        name={shown.map.name}
        state={UNAVAILABLE_STATE}
        transparent={context.variant === 'hero'}
      />
    </View>
  );
}

interface HeroMap3dInput {
  readonly shown: HeroShown;
  readonly context: StageContext;
  readonly feed: HomeMapLive;
  readonly live: StageLiveProps;
  readonly go: (target: AppHref | null, kind: string) => void;
}

function heroMap3d({ shown, context, feed, live, go }: HeroMap3dInput): HomeMap3dProps {
  return {
    scene: shown.scene,
    floor: shown.floor,
    view3d: context.view3d,
    chrome: context.chrome,
    insets: context.chromeInsets,
    label: feed.summary,
    selection: NO_ROOMS,
    selectedItem: null,
    look: shown.look,
    live,
    feed,
    fallback: <HeroStill shown={shown} context={context} live={live} />,
    realistic: null,
    onPickRoom: (roomId): void => {
      go(heroPickTarget(shown.floor, roomId), 'room');
    },
    onPickDevice: (deviceId): void => {
      go(heroTapTarget(shown.floor, { kind: 'device', id: deviceId }), 'device');
    },
  };
}

function HeroBody({ shown, view, dimmed, context, live, realistic }: HeroBodyProps): ReactNode {
  const go = useHeroGo();
  const feed = useHeroFeed(shown, live.active);
  const map3d = heroMap3d({ shown, context, feed, live, go });
  return (
    <View className={cn('absolute inset-0', dimmed && 'opacity-60')}>
      {view === 'realistic' && realistic !== undefined ? (
        realistic({ map: shown.map, map3d })
      ) : (
        <HomeMap3d {...map3d} />
      )}
    </View>
  );
}

interface HeroPlan {
  readonly phase: StagePhase;
  readonly floor: RenderFloor | null;
  readonly name: string | null;
  readonly dimmed: boolean;
}

interface ContentInput {
  readonly hero: Hero;
  readonly stageId: string;
  readonly full: boolean;
  readonly covered: boolean;
  readonly onEdit: () => void;
  readonly realistic: HeroRealistic | undefined;
}

function shownOf(hero: Hero): HeroShown | null {
  const { map, scene, plan, look } = hero;
  if (plan.phase !== 'map' || map === null || scene === null || plan.floor === null) return null;
  return { map, scene, floor: plan.floor, look };
}

function contentOf({
  hero,
  stageId,
  full,
  covered,
  onEdit,
  realistic,
}: ContentInput): StageContent {
  const { plan } = hero;
  const shown = shownOf(hero);
  if (shown === null) {
    return {
      kind: 'direct',
      render: (): ReactNode =>
        plan.phase === 'empty-floor' ? (
          <EmptyFloorRow floorName={plan.floor?.name ?? null} onDrawRooms={onEdit} />
        ) : (
          <StageSkeleton />
        ),
    };
  }
  return {
    kind: 'live',
    id: stageId,
    modalCovered: covered,
    still: (
      <StageStillView
        input={{ floor: shown.floor }}
        name={plan.name}
        state={NO_STATE}
        transparent={!full}
      />
    ),
    render: (context, live) => (
      <HeroBody
        shown={shown}
        view={hero.views.view}
        dimmed={plan.dimmed}
        context={context}
        live={live}
        realistic={realistic}
      />
    ),
  };
}

interface Hero {
  readonly map: HomeMap | null;
  readonly scene: RenderScene | null;
  readonly look: HomeMapLookPref;
  readonly plan: HeroPlan;
  readonly views: StageViews;
  readonly floors: readonly RenderFloor[];
  readonly floorId: string | null;
  readonly setFloorId: (floorId: string) => void;
  readonly maps: StageMaps | undefined;
  readonly notices: ReactNode;
}

interface HeroInput {
  readonly look: HomeMapLookPref;
  readonly realisticOffered: boolean;
  readonly onEdit: () => void;
}

function useHero({ look, realisticOffered, onEdit }: HeroInput): Hero {
  const { map, loading, failure, retry, maps } = useChosenHomeMap(HERO_PAGE);
  const connected = useSyncStatus().status === 'live';
  const scene = useHomeMapScene(map);
  const floors = scene?.floors ?? NO_FLOORS;
  const lastFloor = useLastFloor();
  const views = useStageViews(HERO_PAGE, heroViewFacts(map, realisticOffered));
  const floor = heroFloorOf(floors, lastFloor.floorId);
  const phase = mapIsBlank(map)
    ? 'no-map'
    : stagePhase({ hasMap: map !== null, loading: loading || failure !== null, floor });
  const notices = stageNotices(
    {
      phase,
      connected,
      loadFailed: failure !== null,
      crashed: false,
      leaseFailed: false,
      madeFromRobot: madeFromRobot(map),
      mapNotices: heroMapNotices(map, onEdit),
    },
    { onEdit, onRetryLoad: retry },
  );
  return {
    map,
    scene,
    look,
    plan: { phase, floor, name: map?.name ?? null, dimmed: stageDimmed(phase, connected) },
    views,
    floors,
    floorId: floor?.id ?? null,
    setFloorId: lastFloor.setFloor,
    maps,
    notices: stageNoticesNode(notices),
  };
}

interface HeroStageProps {
  readonly hero: Hero;
  readonly full: boolean;
  readonly covered: boolean;
  readonly onEdit: () => void;
  readonly onFullScreen: (() => void) | undefined;
  readonly realistic: HeroRealistic | undefined;
}

function HeroStage(props: HeroStageProps): ReactNode {
  const { hero, full, covered, onEdit, onFullScreen, realistic } = props;
  const { plan, floors, floorId, views } = hero;
  const chrome = stageChromeShown(plan.phase);
  const stageId = stageIdOf({ kind: full ? 'home-full-screen' : 'home-hero' });
  const lights = useStageLights();
  const frame =
    plan.phase === 'map' ? 'border-transparent bg-transparent!' : 'border-outline-variant';
  return (
    <Stage
      variant={full ? 'full' : 'hero'}
      className={full ? undefined : cn('h-full border-hairline', frame)}
      content={contentOf({ hero, stageId, full, covered, onEdit, realistic })}
      views={views.views}
      view={views.view}
      onViewChange={views.setView}
      tools={chrome ? { tools3d: views.view === '3d', lights, onFullScreen, onEdit } : null}
      maps={hero.maps}
      floors={
        floorId === null
          ? undefined
          : {
              options: floors.map((item) => ({ id: item.id, label: item.name })),
              value: floorId,
              onChange: hero.setFloorId,
            }
      }
      notices={hero.notices}
    />
  );
}

export interface HomeMapHeroProps {
  readonly realistic?: HeroRealistic | undefined;
}

export function HomeMapHero({ realistic }: HomeMapHeroProps): ReactNode {
  const { look, hide } = useHeroLook();
  return look.showOnHome ? <ShownHero look={look} hide={hide} realistic={realistic} /> : null;
}

interface ShownHeroProps {
  readonly look: HomeMapLookPref;
  readonly hide: () => void;
  readonly realistic: HeroRealistic | undefined;
}

function ShownHero({ look, hide, realistic }: ShownHeroProps): ReactNode {
  const router = useRouter();
  const phone = useIsPhone();
  const { height: heightClass } = useSizeClass();
  const { height } = useWindowDimensions();
  const reserve = heightClass === 'compact' ? 0 : SEMANTIC_SIZES.touch.comfortable.touchMin;
  const [full, setFull] = useState(false);
  const onEdit = (): void => {
    router.push(HOME_MAP_EDITOR);
  };
  const hero = useHero({ look, realisticOffered: realistic !== undefined, onEdit });
  useHomeMapDemand('home', hero.map, look);
  const phase = hero.plan.phase;
  useEffect(() => {
    log.debug('hero.phase', { phase });
  }, [phase]);
  if (phase === 'no-map') {
    return (
      <HeroNoMap
        map={hero.map}
        menu={[{ label: 'Hide from Home', icon: 'eyeOff', onPress: hide }]}
      />
    );
  }
  const close = (): void => {
    setFull(false);
  };
  const shared = { hero, onEdit, realistic };
  return (
    <View style={heroFrameStyle(phone, height, reserve)} className="w-full">
      <HeroStage
        {...shared}
        full={false}
        covered={full}
        onFullScreen={
          full
            ? undefined
            : (): void => {
                setFull(true);
              }
        }
      />
      {full ? (
        <StageFullScreen title={hero.plan.name ?? 'Home map'} onClose={close}>
          <HeroStage {...shared} full covered={false} onFullScreen={undefined} />
        </StageFullScreen>
      ) : null}
    </View>
  );
}
