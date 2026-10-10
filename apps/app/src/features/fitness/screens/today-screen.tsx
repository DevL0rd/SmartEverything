import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { NavRow } from '../../../components/rows';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import type { MenuItem } from '../../../components/menu';
import { WidgetBoard, useBoardEditor, type BoardEditor } from '../../../components/widget-board';
import { errorText } from '../../../format/errors';
import { usePageLayout, useSavePageLayout } from '../../../store/layouts';
import { FitnessFrame } from '../components/fitness-frame';
import { FitnessToolbar } from '../components/fitness-toolbar';
import { instanceCheck, useAvailableWidgets } from '../data/availability';
import { useFitnessParams } from '../data/day';
import { HEALTH_CONNECT_ON_DEVICE } from '../data/health-connect';
import { useHealthPresence, type HealthPresence } from '../data/presence';
import { TodayContext, useTodayData, type TodayData } from '../data/today';
import { useStartWorkout } from '../../watches';
import { FITNESS_DEFAULTS, FITNESS_PAGE, FITNESS_WIDGETS } from '../widgets';

function FirstRun(): ReactNode {
  return (
    <Screen header={<PageHeader title="Fitness" back={false} />} maxWidth="reading">
      {HEALTH_CONNECT_ON_DEVICE ? (
        <EmptyState
          icon="fitness"
          title="Connect Health Connect"
          body="See your steps, sleep, heart rate and workouts here."
          action={<Button label="Connect" href={href.settings.page('health')} />}
        />
      ) : (
        <EmptyState
          icon="fitness"
          title="No fitness data yet"
          body="Fitness data comes from Health Connect on your Android phone."
        />
      )}
    </Screen>
  );
}

function Board({
  data,
  presence,
  editor,
}: {
  readonly data: TodayData;
  readonly presence: HealthPresence;
  readonly editor: BoardEditor;
}): ReactNode {
  const available = useAvailableWidgets(data, presence);
  return (
    <TodayContext.Provider value={data}>
      <WidgetBoard
        editor={editor}
        catalogue={FITNESS_WIDGETS}
        available={available}
        instanceAvailable={instanceCheck(data)}
      />
    </TodayContext.Provider>
  );
}

function useBrowseItems(): readonly MenuItem[] {
  const router = useRouter();
  return [
    {
      label: 'Log health data',
      icon: 'plus',
      onPress: (): void => {
        router.push(href.logHealth());
      },
    },
    {
      label: 'All health data',
      icon: 'list',
      onPress: (): void => {
        router.push(href.fitnessPage('browse'));
      },
    },
  ];
}

export function TodayScreen(): ReactNode {
  const workout = useStartWorkout(false);
  const { day, today } = useFitnessParams('day');
  const data = useTodayData(day, today);
  const presence = useHealthPresence(today);
  const editor = useBoardEditor({
    page: FITNESS_PAGE,
    layout: usePageLayout(FITNESS_PAGE),
    defaults: FITNESS_DEFAULTS,
    onSave: useSavePageLayout(FITNESS_PAGE),
  });
  const browse = useBrowseItems();
  if (presence.loaded && presence.types.size === 0) {
    return <FirstRun />;
  }
  const problem = data.error ?? presence.error;
  return (
    <FitnessFrame
      tab="today"
      width="dashboard"
      toolbar={<FitnessToolbar day={day} today={today} range="day" />}
      actions={editor.editing ? [] : [editor.editAction]}
      overflow={browse}
      editing={editor.header}
      primaryAction={editor.editing ? undefined : workout.action}
    >
      {workout.sheet}
      {problem === null ? null : (
        <Banner
          tone="critical"
          title="Some health data could not be loaded"
          body={errorText(problem).title}
        />
      )}
      <Board data={data} presence={presence} editor={editor} />
      {editor.editing ? null : (
        <List inset>
          <NavRow title="All health data" icon="list" href={href.fitnessPage('browse')} />
        </List>
      )}
    </FitnessFrame>
  );
}
