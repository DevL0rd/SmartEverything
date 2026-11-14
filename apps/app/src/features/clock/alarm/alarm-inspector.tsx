import type { PlannerPreferences } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { IconButton } from '../../../components/icon-button';
import { usePlannerPreferences } from '../../planner/data';
import { QueryBody } from '../../planner/frame/query-body';
import {
  AlarmBody,
  AlarmCreateBar,
  AlarmSkip,
  AlarmTitle,
  useAlarmScreen,
  type AlarmBodyTarget,
} from './alarm-body';

export type AlarmInspectorProps = AlarmBodyTarget;

function OpenInspector({
  target,
  prefs,
}: {
  readonly target: AlarmBodyTarget;
  readonly prefs: PlannerPreferences;
}): ReactNode {
  const screen = useAlarmScreen(target, prefs, true);
  return (
    <>
      <View className="flex-row items-center gap-2">
        <AlarmTitle screen={screen} />
        <AlarmSkip screen={screen} />
        <IconButton icon="close" label="Close the alarm" onPress={target.onClose} />
      </View>
      <AlarmBody target={target} screen={screen} defaultSceneId={prefs.clock.wake_scene_id} />
      <AlarmCreateBar screen={screen} onCancel={target.onClose} />
    </>
  );
}

export function AlarmInspector(props: AlarmInspectorProps): ReactNode {
  const query = usePlannerPreferences(props.person);
  return (
    <Card className="w-85 shrink-0">
      <QueryBody query={query}>
        {(prefs) => <OpenInspector key={props.alarm?.id ?? 'new'} target={props} prefs={prefs} />}
      </QueryBody>
    </Card>
  );
}
