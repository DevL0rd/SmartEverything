import type { ReactNode } from 'react';
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
  type BoardWidget,
} from '../../../components/widget-board';
import { useSizeClass } from '../../../design/size-class';
import { usePageLayout, useSavePageLayout } from '../../../store/layouts';
import { useSettings } from '../../../store/selectors';
import { cameraInstanceAvailable } from '../../cameras';
import { useNutritionWidgets, useTodayKey } from '../../nutrition';
import { useClimateWidgets } from '../../climate';
import { useWeather, weatherShown } from '../../weather';
import { settingsItem } from '../../../settings/settings-item';
import { HeaderBelow, SummaryLine } from '../components/home-header';
import {
  HomeDataContext,
  availableWidgets,
  useHomeData,
  type HomeData,
  type HomeView,
} from '../data/home-data';
import { spotlightable } from '../model/spotlight';
import { spotlightOf } from '../widgets/spotlight';
import { HOME_PAGE, HOME_RETIRED, HOME_WIDGETS, homeDefaults } from '../widgets';

const HOME_SETTINGS = settingsItem(href.settings.page('home'));

function EmptyHome({ title }: { readonly title: string }): ReactNode {
  return (
    <Screen header={<PageHeader title={title} back={false} />} maxWidth="reading">
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

function instanceCheck(data: HomeData): (widget: BoardWidget) => boolean {
  const cameraShown = cameraInstanceAvailable(data.cameras);
  return (widget) => {
    if (widget.type === 'camera') {
      return cameraShown(widget);
    }
    const deviceId = spotlightOf(widget);
    if (widget.type !== 'spotlight' || deviceId === null) {
      return true;
    }
    return data.devices.some((device) => device.id === deviceId && spotlightable(device));
  };
}

export function HomeScreen(): ReactNode {
  const data = useHomeData();
  const title = useSettings().home_name;
  const { header } = useSizeClass();
  const editor = useBoardEditor({
    page: HOME_PAGE,
    layout: withoutRetired(usePageLayout(HOME_PAGE), HOME_RETIRED),
    defaults: homeDefaults(data.devices, data.cameras),
    onSave: useSavePageLayout(HOME_PAGE),
  });
  const view = useView(data, editor);
  const nutrition = useNutritionWidgets(useTodayKey().day);
  const weather = weatherShown(useWeather()) ? ['weather'] : [];
  const climate = useClimateWidgets().types;
  if (data.devices.length === 0) {
    return <EmptyHome title={title} />;
  }
  return (
    <Screen
      header={
        <PageHeader
          title={title}
          back={false}
          actions={editor.editing ? [] : [editor.editAction]}
          overflow={editor.editing ? [] : [HOME_SETTINGS]}
          search={header !== 'large'}
          editing={editor.header}
          {...(header === 'standard'
            ? {}
            : { below: <HeaderBelow summary={data.summary} search={header === 'large'} /> })}
        />
      }
    >
      {header === 'standard' ? <SummaryLine summary={data.summary} /> : null}
      <HomeDataContext value={view}>
        <WidgetBoard
          editor={editor}
          catalogue={HOME_WIDGETS}
          available={new Set([...availableWidgets(view), ...nutrition, ...weather, ...climate])}
          instanceAvailable={instanceCheck(data)}
        />
      </HomeDataContext>
    </Screen>
  );
}
