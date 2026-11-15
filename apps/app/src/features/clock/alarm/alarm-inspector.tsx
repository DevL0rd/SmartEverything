import type { PlannerPreferences } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { usePlannerPreferences, QueryBody } from '../../planner';
import {
  AlarmBody,
  AlarmCreateBar,
  AlarmSkip,
  AlarmTitle,
  useAlarmScreen,
  type AlarmBodyTarget,
} from './alarm-body';

export type AlarmInspectorProps = AlarmBodyTarget;

export const ALARM_INSPECTOR_WIDTH = 420;

function OpenInspector({
  target,
  prefs,
}: {
  readonly target: AlarmBodyTarget;
  readonly prefs: PlannerPreferences;
}): ReactNode {
  const screen = useAlarmScreen(target, prefs, false);
  return (
    <View className="min-h-0 flex-1">
      <View className="min-h-touch-min flex-row items-center gap-2 pb-2 pl-6 pr-2 pt-4">
        <AlarmTitle screen={screen} />
        <AlarmSkip screen={screen} />
        <IconButton icon="close" label="Close the alarm" onPress={target.onClose} />
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-6 pb-6 pt-2">
        <AlarmBody
          target={target}
          screen={screen}
          defaultAutomationId={prefs.clock.wake_automation_id}
        />
      </ScrollView>
      {screen.editing.alarm === null ? (
        <View className="border-t border-outline-variant px-6 py-4">
          <AlarmCreateBar screen={screen} onCancel={target.onClose} />
        </View>
      ) : null}
    </View>
  );
}

export function AlarmInspector(props: AlarmInspectorProps): ReactNode {
  const query = usePlannerPreferences(props.person);
  if (query.data === undefined) {
    return (
      <View className="p-6">
        <QueryBody query={query}>{() => null}</QueryBody>
      </View>
    );
  }
  return <OpenInspector key={props.alarm?.id ?? 'new'} target={props} prefs={query.data} />;
}
