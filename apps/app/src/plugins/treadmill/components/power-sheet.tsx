import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { canStopBelt, POWER_NOTE, powerStateLine, STOP_NOTE } from '../model/power-model';
import { useLiveSelect } from '../data/treadmill-data';
import { useStopBelt } from './belt-controls';

export function PowerSheet({
  deviceId,
  view,
  open,
  onClose,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  const now = useMinute();
  const stop = useStopBelt(deviceId);
  const stoppable = canStopBelt(view.link, state);
  return (
    <BottomSheet open={open} onClose={onClose} title="Power" label="Power" detents={['fit']}>
      <View className="gap-4 px-4 pb-4">
        <Text variant="title-3">{powerStateLine(view.link, state, now)}</Text>
        <Text variant="body" tone="variant">
          {POWER_NOTE}
        </Text>
        {stoppable ? (
          <View className="gap-2">
            <Button
              label="Stop belt"
              icon="square"
              variant="destructive"
              size="lg"
              grow
              disabled={stop.pending}
              onPress={() => {
                stop.press();
                onClose();
              }}
            />
            <Text variant="footnote" tone="variant">
              {STOP_NOTE}
            </Text>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}
