import { useEffect, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { DEVICE_TARGET } from '@smarteverything/domain';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import {
  WidgetBoard,
  boardClassOf,
  useBoardEditor,
  withoutRetired,
  type BoardEditor,
  type BoardReveal,
  type BoardWidget,
} from '../../../components/widget-board';
import { useStableValue } from '../../../components/use-stable-value';
import { useSizeClass } from '../../../design/size-class';
import { usePageLayout, useSavePageLayout } from '../../../store/layouts';
import { useSettings } from '../../../store/selectors';
import { usePluginHomeTypes } from '../../../plugins/home-widgets';
import { cameraInstanceAvailable } from '../../cameras';
import { useNutritionWidgets, useTodayKey } from '../../nutrition';
import { useClimateWidgets } from '../../climate';
import { useLightGroupDefaults } from '../../device-groups';
import { useWeather, weatherShown } from '../../weather';
import { HeaderBelow, SummaryLine } from '../components/home-header';
import {
  HomeDataContext,
  availableWidgets,
  sameIds,
  useHomeBasics,
  useHomeData,
  useHomeViewStore,
  type HomeData,
  type HomeView,
} from '../data/home-data';
import { spotlightOf } from '../widgets/spotlight';
import { HOME_PAGE, HOME_RETIRED, HOME_WIDGETS, homeDefaults } from '../widgets';

const log = new Logger('app.home');

const REVEAL_PARAMS = z.object({
  reveal: z.string().min(1).optional(),
  member: z.string().min(1).optional(),
});

const TARGET_OPTIONS = z.object({ target: DEVICE_TARGET });

function memberPageOf(widget: BoardWidget, member: string | undefined): Href | null {
  const options = TARGET_OPTIONS.safeParse(widget.options);
  if (!options.success) {
    return null;
  }
  const { target } = options.data;
  switch (target.kind) {
    case 'group':
      return href.group(target.groupId, { member });
    case 'room':
      return href.roomLights(target.roomId, { member });
    case 'devices':
      return null;
  }
}

function useReveal(): BoardReveal | undefined {
  const params = REVEAL_PARAMS.safeParse(useLocalSearchParams());
  const router = useRouter();
  if (!params.success || params.data.reveal === undefined) {
    return undefined;
  }
  const { reveal, member } = params.data;
  return {
    key: reveal,
    member: member ?? null,
    pageOf: (widget): Href | null => memberPageOf(widget, member),
    onDone: (): void => {
      router.setParams({ reveal: undefined, member: undefined });
    },
  };
}

function EmptyHome({ title }: { readonly title: string }): ReactNode {
  return (
    <Screen
      header={<PageHeader title={title} settings={mainPageSettings('home')} back={false} />}
      maxWidth="reading"
    >
      <EmptyState
        icon="home"
        title="Let’s add your first devices"
        body="Link the account your devices use and they show up here."
        action={<Button label="Connect an account" href={href.settings.page('connections/add')} />}
      />
    </Screen>
  );
}

function useView(data: HomeData, editor: BoardEditor): HomeView {
  const { width } = useSizeClass();
  const ids = editor.arrangement(boardClassOf(width)).map(spotlightOf);
  return { ...data, spotlighted: new Set(ids.filter((id) => id !== null)) };
}

function instanceCheck(
  cameras: HomeData['cameras'],
  spotlightable: readonly string[],
): (widget: BoardWidget) => boolean {
  const cameraShown = cameraInstanceAvailable(cameras);
  return (widget) => {
    if (widget.type === 'camera') {
      return cameraShown(widget);
    }
    const deviceId = spotlightOf(widget);
    if (widget.type !== 'spotlight' || deviceId === null) {
      return true;
    }
    return spotlightable.includes(deviceId);
  };
}

function useAvailableTypes(view: HomeView): ReadonlySet<string> {
  const nutrition = useNutritionWidgets(useTodayKey().day);
  const weather = weatherShown(useWeather()) ? ['weather'] : [];
  const climate = useClimateWidgets().types;
  const plugins = usePluginHomeTypes();
  return useStableValue(
    new Set([...availableWidgets(view), ...nutrition, ...weather, ...climate, ...plugins]),
    sameIds,
  );
}

function HomeBoard({
  editor,
  reveal,
}: {
  readonly editor: BoardEditor;
  readonly reveal: BoardReveal | undefined;
}): ReactNode {
  const data = useHomeData();
  const view = useView(data, editor);
  const viewStore = useHomeViewStore(view);
  const available = useAvailableTypes(view);
  const widgetCount = available.size;
  useEffect(() => {
    log.debug('board.available_changed', { widgets: widgetCount });
  }, [widgetCount]);
  const revealKey = reveal?.key ?? null;
  useEffect(() => {
    log.info('board.mounted', { revealing: revealKey });
    return (): void => {
      log.info('board.unmounted');
    };
  }, [revealKey]);
  return (
    <HomeDataContext value={viewStore}>
      <WidgetBoard
        editor={editor}
        catalogue={HOME_WIDGETS}
        available={available}
        instanceAvailable={instanceCheck(data.cameras, data.digest.spotlightable)}
        {...(reveal === undefined ? {} : { reveal })}
      />
    </HomeDataContext>
  );
}

export function HomeScreen(): ReactNode {
  const { digest, cameras } = useHomeBasics();
  const title = useSettings().home_name;
  const { header } = useSizeClass();
  const lightGroups = useLightGroupDefaults();
  const reveal = useReveal();
  const editor = useBoardEditor({
    page: HOME_PAGE,
    layout: withoutRetired(usePageLayout(HOME_PAGE), HOME_RETIRED),
    defaults: homeDefaults(digest, cameras, lightGroups),
    onSave: useSavePageLayout(HOME_PAGE),
  });
  const editing = editor.editing;
  const deviceCount = digest.count;
  useEffect(() => {
    log.info('screen.mounted');
    return (): void => {
      log.info('screen.unmounted');
    };
  }, []);
  const cameraCount = cameras.length;
  useEffect(() => {
    log.debug('screen.counts_changed', { devices: deviceCount, cameras: cameraCount });
  }, [deviceCount, cameraCount]);
  useEffect(() => {
    log.info('board.edit_changed', { editing });
  }, [editing]);
  if (digest.count === 0) {
    return <EmptyHome title={title} />;
  }
  return (
    <Screen
      header={
        <PageHeader
          title={title}
          settings={mainPageSettings('home')}
          back={false}
          actions={editor.editing ? [] : [editor.editAction]}
          search={header !== 'large'}
          editing={editor.header}
          {...(header === 'standard' ? {} : { below: <HeaderBelow search={header === 'large'} /> })}
        />
      }
    >
      {header === 'standard' ? <SummaryLine /> : null}
      <HomeBoard editor={editor} reveal={reveal} />
    </Screen>
  );
}
