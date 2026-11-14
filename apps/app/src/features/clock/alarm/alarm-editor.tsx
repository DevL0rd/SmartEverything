import type { PlannerAlarmRow, PlannerPreferences } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { Sheet } from '../../../components/sheet';
import { usePlannerAlarms, usePlannerPreferences, type PlannerPerson } from '../../planner/data';
import { QueryBody } from '../../planner/frame/query-body';
import { AlarmBody, AlarmCreateBar, AlarmSkip, useAlarmScreen } from './alarm-body';

export interface AlarmEditorProps {
  readonly person: PlannerPerson;
  readonly alarmId: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (alarm: PlannerAlarmRow) => void;
}

interface OpenProps extends AlarmEditorProps {
  readonly alarm: PlannerAlarmRow | null;
  readonly prefs: PlannerPreferences;
}

function OpenAlarmEditor(props: OpenProps): ReactNode {
  const target = {
    person: props.person,
    alarm: props.alarm,
    onCreated: props.onCreated,
    onClose: props.onClose,
  };
  const screen = useAlarmScreen(target, props.prefs, false);
  const create = <AlarmCreateBar screen={screen} onCancel={props.onClose} />;
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={screen.title}
      detents={['full']}
      {...(props.alarm === null ? { footer: create } : {})}
    >
      <View className="gap-4 pb-4 pt-2">
        <View className="flex-row justify-end">
          <AlarmSkip screen={screen} />
        </View>
        <AlarmBody
          target={target}
          screen={screen}
          defaultSceneId={props.prefs.clock.wake_scene_id}
        />
      </View>
    </Sheet>
  );
}

function useOpenRound(open: boolean): number {
  const [round, setRound] = useState(0);
  const [shown, setShown] = useState(open);
  if (shown !== open) {
    setShown(open);
    if (open) setRound(round + 1);
  }
  return round;
}

export function AlarmEditor(props: AlarmEditorProps): ReactNode {
  const query = usePlannerPreferences(props.person);
  const alarms = usePlannerAlarms(props.person);
  const round = useOpenRound(props.open);
  const alarm = props.alarmId === null ? null : alarms.find((row) => row.id === props.alarmId);
  if (alarm === undefined) {
    return (
      <Sheet open={props.open} onClose={props.onClose} label="Alarm" detents={['fit']}>
        <EmptyState
          icon="alarmClock"
          title="This alarm is gone"
          body="It was deleted, or it belongs to someone else."
        />
      </Sheet>
    );
  }
  if (query.data === undefined) {
    return (
      <Sheet open={props.open} onClose={props.onClose} label="Alarm" detents={['fit']}>
        <QueryBody query={query}>{() => null}</QueryBody>
      </Sheet>
    );
  }
  return (
    <OpenAlarmEditor
      key={`${alarm?.id ?? 'new'}:${String(round)}`}
      {...props}
      alarm={alarm}
      prefs={query.data}
    />
  );
}
