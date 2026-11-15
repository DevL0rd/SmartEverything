import type { PlannerAlarmRow, PlannerPreferences } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../components/banner';
import { EmptyState } from '../../components/empty-state';
import { useFrameBodyWidth } from '../../components/page-shell/body-width';
import { asideDockedAt } from '../../components/page-shell/layout';
import type { ShellAction } from '../../components/page-shell/shell-actions';
import type { ShellAside } from '../../components/page-shell/shell-types';
import { useSizeClass } from '../../design/size-class';
import { useMinute } from '../../store/clock';
import { useSettings } from '../../store/selectors';
import {
  usePlannerAlarms,
  usePlannerPreferences,
  AlarmList,
  alarmsInRingOrder,
  alarmsSubtitleOf,
} from '../planner';
import { AlarmEditor } from './alarm/alarm-editor';
import { ALARM_INSPECTOR_WIDTH, AlarmInspector } from './alarm/alarm-inspector';
import { SystemAlarmRow } from './alarm/system-alarm-row';
import { WakeInsightsCard } from './alarm/wake-chart';
import { ClockFrame } from './frame/clock-frame';
import { useHubOffline } from './frame/hub-status';
import { WatchArrivalsNotice } from './watch-notice';

const WIDE_CARDS_FROM = 600;

type Chosen =
  | { readonly kind: 'next' }
  | { readonly kind: 'alarm'; readonly id: string }
  | { readonly kind: 'new' }
  | { readonly kind: 'none' };

interface EditorState {
  readonly open: boolean;
  readonly alarmId: string | null;
}

interface AlarmsView {
  readonly alarms: readonly PlannerAlarmRow[];
  readonly prefs: UseQueryResult<PlannerPreferences>;
  readonly now: number;
  readonly timeZone: string;
  readonly offline: boolean;
}

function NoAlarms(): ReactNode {
  return (
    <EmptyState
      icon="alarmClock"
      title="No alarms yet"
      body="Add one with New alarm, from quick add or from chat. Each alarm shows when it rings next and where."
    />
  );
}

function PrefsFailed({ prefs }: { readonly prefs: UseQueryResult<PlannerPreferences> }): ReactNode {
  if (!prefs.isError || prefs.data !== undefined) return null;
  return (
    <Banner
      tone="critical"
      title="Couldn’t load your clock settings"
      body="Alarms still show and ring. Editing waits until the settings load."
      wrapBody
      action={{
        label: 'Retry',
        icon: 'refresh',
        onPress: () => {
          background(prefs.refetch(), 'clock.preferences_refetch_failed');
        },
      }}
    />
  );
}

function AlarmColumn({
  view,
  selectedId,
  onOpen,
}: {
  readonly view: AlarmsView;
  readonly selectedId: string | null;
  readonly onOpen: (alarm: PlannerAlarmRow) => void;
}): ReactNode {
  const compact = useFrameBodyWidth() < WIDE_CARDS_FROM;
  const prefs = view.prefs.data;
  const none = view.alarms.length === 0;
  return (
    <View className="gap-3">
      <PrefsFailed prefs={view.prefs} />
      <WatchArrivalsNotice />
      {none ? (
        <NoAlarms />
      ) : (
        <AlarmList
          person={null}
          alarms={view.alarms}
          timeZone={view.timeZone}
          weekStart={prefs === undefined ? null : prefs.general.week_start}
          defaults={prefs === undefined ? null : prefs.clock}
          layout={compact ? 'compact' : 'wide'}
          offline={view.offline}
          selectedId={selectedId}
          onOpen={onOpen}
        />
      )}
      <SystemAlarmRow now={view.now} timeZone={view.timeZone} compact={compact} />
      {none ? null : <WakeInsightsCard compact={compact} timeZone={view.timeZone} />}
    </View>
  );
}

function chosenAlarmOf(view: AlarmsView, chosen: Chosen): PlannerAlarmRow | null | undefined {
  if (chosen.kind === 'new') return null;
  if (chosen.kind === 'none') return undefined;
  if (chosen.kind === 'next') return alarmsInRingOrder(view.alarms, view.now, view.timeZone)[0];
  return view.alarms.find((alarm) => alarm.id === chosen.id);
}

function inspectorAsideOf(
  alarm: PlannerAlarmRow | null | undefined,
  onChoose: (chosen: Chosen) => void,
): ShellAside {
  const close = (): void => {
    onChoose({ kind: 'none' });
  };
  return {
    label: alarm === null ? 'New alarm' : 'Alarm',
    open: alarm !== undefined,
    width: ALARM_INSPECTOR_WIDTH,
    onClose: close,
    children:
      alarm === undefined ? null : (
        <AlarmInspector
          person={null}
          alarm={alarm}
          onCreated={(row) => {
            onChoose({ kind: 'alarm', id: row.id });
          }}
          onClose={close}
        />
      ),
  };
}

function useAlarmsView(): AlarmsView {
  return {
    alarms: usePlannerAlarms(null),
    prefs: usePlannerPreferences(null),
    now: useMinute(),
    timeZone: useSettings().time_zone,
    offline: useHubOffline(),
  };
}

function useDocked(): boolean {
  const size = useSizeClass();
  return size.header !== 'large' && asideDockedAt(size.area);
}

export function AlarmsPage(): ReactNode {
  const view = useAlarmsView();
  const docked = useDocked();
  const [chosen, setChosen] = useState<Chosen>({ kind: 'next' });
  const [editor, setEditor] = useState<EditorState>({ open: false, alarmId: null });
  const inspected = docked ? chosenAlarmOf(view, chosen) : undefined;
  const aside = inspectorAsideOf(inspected, setChosen);
  const subtitle = alarmsSubtitleOf(view.alarms, view.now, view.timeZone);
  const newAlarm: ShellAction = {
    icon: 'plus',
    label: 'New alarm',
    primary: true,
    disabled: view.offline,
    onPress: () => {
      if (docked) setChosen({ kind: 'new' });
      else setEditor({ open: true, alarmId: null });
    },
  };
  return (
    <ClockFrame
      section="index"
      actions={[newAlarm]}
      {...(docked ? { aside } : {})}
      {...(subtitle === null ? {} : { subtitle })}
    >
      <AlarmColumn
        view={view}
        selectedId={inspected?.id ?? null}
        onOpen={(row) => {
          if (docked) setChosen({ kind: 'alarm', id: row.id });
          else setEditor({ open: true, alarmId: row.id });
        }}
      />
      {docked ? null : (
        <AlarmEditor
          person={null}
          alarmId={editor.alarmId}
          open={editor.open}
          onClose={() => {
            setEditor({ ...editor, open: false });
          }}
          onCreated={(row) => {
            setEditor({ open: true, alarmId: row.id });
          }}
        />
      )}
    </ClockFrame>
  );
}
