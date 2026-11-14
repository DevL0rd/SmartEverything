import type { PlannerAlarmRow, PlannerPreferences } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import type { HeaderAction } from '../../components/page-header';
import { useAreaWidth } from '../../design/size-class';
import { useMinute } from '../../store/clock';
import { useSettings } from '../../store/selectors';
import { usePlannerAlarms, usePlannerPreferences } from '../planner/data';
import { AlarmList } from '../planner/clock/alarm-card';
import { alarmsInRingOrder, alarmsSubtitleOf } from '../planner/clock/alarm-text';
import { QueryBody } from '../planner/frame/query-body';
import { AlarmEditor } from './alarm/alarm-editor';
import { AlarmInspector } from './alarm/alarm-inspector';
import { SystemAlarmRow } from './alarm/system-alarm-row';
import { WakeInsightsCard } from './alarm/wake-chart';
import { ClockFrame } from './frame/clock-frame';
import { useHubOffline } from './frame/hub-status';
import { frameLayoutOf } from './frame/sections';
import { WatchArrivalsNotice } from './watch-notice';

type Layout = ReturnType<typeof frameLayoutOf>;

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
  readonly prefs: PlannerPreferences;
  readonly now: number;
  readonly timeZone: string;
  readonly layout: Layout;
  readonly offline: boolean;
}

function NoAlarms({
  onNew,
  offline,
}: {
  readonly onNew: () => void;
  readonly offline: boolean;
}): ReactNode {
  return (
    <EmptyState
      icon="alarmClock"
      title="No alarms yet"
      body="Add one here, from quick add or from chat. Each alarm shows when it rings next and where."
      action={<Button label="New alarm" icon="plus" disabled={offline} onPress={onNew} />}
    />
  );
}

function AlarmColumn({
  view,
  selectedId,
  onOpen,
  onNew,
}: {
  readonly view: AlarmsView;
  readonly selectedId: string | null;
  readonly onOpen: (alarm: PlannerAlarmRow) => void;
  readonly onNew: () => void;
}): ReactNode {
  const compact = view.layout === 'compact';
  return (
    <View className="gap-3">
      <WatchArrivalsNotice />
      {view.alarms.length === 0 ? (
        <NoAlarms onNew={onNew} offline={view.offline} />
      ) : (
        <AlarmList
          person={null}
          alarms={view.alarms}
          timeZone={view.timeZone}
          weekStart={view.prefs.general.week_start}
          layout={compact ? 'compact' : 'wide'}
          offline={view.offline}
          selectedId={selectedId}
          onOpen={onOpen}
        />
      )}
      <SystemAlarmRow now={view.now} timeZone={view.timeZone} compact={compact} />
      <WakeInsightsCard compact={compact} timeZone={view.timeZone} />
    </View>
  );
}

function chosenAlarmOf(view: AlarmsView, chosen: Chosen): PlannerAlarmRow | null | undefined {
  if (chosen.kind === 'new') return null;
  if (chosen.kind === 'none') return undefined;
  if (chosen.kind === 'next') return alarmsInRingOrder(view.alarms, view.now, view.timeZone)[0];
  return view.alarms.find((alarm) => alarm.id === chosen.id);
}

function WideAlarms({
  view,
  chosen,
  onChoose,
}: {
  readonly view: AlarmsView;
  readonly chosen: Chosen;
  readonly onChoose: (chosen: Chosen) => void;
}): ReactNode {
  const alarm = chosenAlarmOf(view, chosen);
  return (
    <View className="min-h-0 flex-1 flex-row gap-6">
      <ScrollView className="flex-1" contentContainerClassName="pb-section-gap">
        <AlarmColumn
          view={view}
          selectedId={alarm?.id ?? null}
          onOpen={(row) => {
            onChoose({ kind: 'alarm', id: row.id });
          }}
          onNew={() => {
            onChoose({ kind: 'new' });
          }}
        />
      </ScrollView>
      {alarm === undefined ? null : (
        <View className="w-85">
          <ScrollView className="flex-1" contentContainerClassName="pb-section-gap">
            <AlarmInspector
              person={null}
              alarm={alarm}
              onCreated={(row) => {
                onChoose({ kind: 'alarm', id: row.id });
              }}
              onClose={() => {
                onChoose({ kind: 'none' });
              }}
            />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function SheetAlarms({
  view,
  editor,
  onEditor,
}: {
  readonly view: AlarmsView;
  readonly editor: EditorState;
  readonly onEditor: (editor: EditorState) => void;
}): ReactNode {
  return (
    <>
      <AlarmColumn
        view={view}
        selectedId={null}
        onOpen={(row) => {
          onEditor({ open: true, alarmId: row.id });
        }}
        onNew={() => {
          onEditor({ open: true, alarmId: null });
        }}
      />
      <AlarmEditor
        person={null}
        alarmId={editor.alarmId}
        open={editor.open}
        onClose={() => {
          onEditor({ ...editor, open: false });
        }}
        onCreated={(row) => {
          onEditor({ open: true, alarmId: row.id });
        }}
      />
    </>
  );
}

function useAlarmsView(): Omit<AlarmsView, 'prefs'> {
  const alarms = usePlannerAlarms(null);
  return {
    alarms,
    now: useMinute(),
    timeZone: useSettings().time_zone,
    layout: frameLayoutOf(useAreaWidth()),
    offline: useHubOffline(),
  };
}

export function AlarmsPage(): ReactNode {
  const base = useAlarmsView();
  const prefs = usePlannerPreferences(null);
  const [chosen, setChosen] = useState<Chosen>({ kind: 'next' });
  const [editor, setEditor] = useState<EditorState>({ open: false, alarmId: null });
  const wide = base.layout === 'wide';
  const subtitle = alarmsSubtitleOf(base.alarms, base.now, base.timeZone);
  const newAlarm: HeaderAction = {
    icon: 'plus',
    label: 'New alarm',
    primary: true,
    disabled: base.offline,
    onPress: () => {
      if (wide) setChosen({ kind: 'new' });
      else setEditor({ open: true, alarmId: null });
    },
  };
  return (
    <ClockFrame
      section="index"
      actions={[newAlarm]}
      width={wide ? 'dashboard' : 'detail'}
      scroll={!wide}
      {...(subtitle === null ? {} : { subtitle })}
    >
      <QueryBody query={prefs}>
        {(loaded) =>
          wide ? (
            <WideAlarms view={{ ...base, prefs: loaded }} chosen={chosen} onChoose={setChosen} />
          ) : (
            <SheetAlarms view={{ ...base, prefs: loaded }} editor={editor} onEditor={setEditor} />
          )
        }
      </QueryBody>
    </ClockFrame>
  );
}
