import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { useControl } from '../../../store/control';
import { useLiveSelect, useTreadmillState } from '../data/treadmill-data';
import { useTreadmillAct } from '../data/treadmill-act';
import { noticesOf } from '../model/notices';

function Notices({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  const controlLost = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.controlLost);
  const childLock = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.childLock);
  const { act } = useTreadmillAct(deviceId);
  const incline = useControl(deviceId, 'belt_incline');
  const notices = noticesOf(view, { state, controlLost, childLock }, incline.failure);
  if (notices.length === 0) {
    return null;
  }
  return (
    <View className="gap-2">
      {notices.map((notice) => (
        <Banner
          key={notice.key}
          tone={notice.tone}
          title={notice.title}
          body={notice.body}
          wrapBody
          {...(notice.takeOver
            ? {
                action: {
                  label: 'Use this phone',
                  onPress: (): void => {
                    act({ action: 'take_over' }, 'This phone could not take over the link', true);
                  },
                },
              }
            : {})}
        />
      ))}
    </View>
  );
}

export function BeltNotices({ deviceId }: { readonly deviceId: string }): ReactNode {
  const state = useTreadmillState(deviceId);
  return state.data === undefined ? null : <Notices deviceId={deviceId} view={state.data} />;
}
