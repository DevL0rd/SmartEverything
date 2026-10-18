import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PendingRevert } from '@smarteverything/domain';
import { DISPLAY_REVERT_SECONDS } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { DialogFrame } from '../../../components/dialog-frame';
import { Text } from '../../../components/text';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useSecondOf } from '../../../store/clock';
import { remainingSeconds } from '../model/displays-model';

function Footer({
  left,
  blank,
  deciding,
  onDecide,
}: {
  readonly left: number;
  readonly blank: boolean;
  readonly deciding: boolean;
  readonly onDecide: (keep: boolean) => void;
}): ReactNode {
  return (
    <>
      <Button
        label={`Revert (${String(left)})`}
        variant={blank ? 'filled' : 'tonal'}
        disabled={deciding}
        onPress={() => {
          onDecide(false);
        }}
      />
      <Button
        label="Keep"
        variant={blank ? 'tonal' : 'filled'}
        disabled={deciding}
        onPress={() => {
          onDecide(true);
        }}
      />
    </>
  );
}

export function KeepDialog({
  pending,
  blank,
  deciding,
  onDecide,
  onExpire,
}: {
  readonly pending: PendingRevert;
  readonly blank: boolean;
  readonly deciding: boolean;
  readonly onDecide: (keep: boolean) => void;
  readonly onExpire: () => void;
}): ReactNode {
  const left = useSecondOf((now) => remainingSeconds(pending, now));
  const expire = useStableCallback(onExpire);
  useEffect(() => {
    if (left === 0) expire();
  }, [left, expire]);
  return (
    <DialogFrame
      open
      onClose={() => {
        onDecide(false);
      }}
      label="Keep these display settings?"
      title="Keep these display settings?"
      kind="dialog"
      footer={<Footer left={left} blank={blank} deciding={deciding} onDecide={onDecide} />}
    >
      <View className="gap-4">
        <Text variant="body">{pending.summary}</Text>
        <Text variant="callout" tone="variant">
          {blank
            ? 'This was your only screen. If you can’t see this, do nothing: it comes back by itself.'
            : 'If the screen looks wrong, do nothing. It goes back by itself.'}
        </Text>
        <ProgressBar
          progress={left / DISPLAY_REVERT_SECONDS}
          colour="on-surface-variant"
          label="Time left to keep"
        />
      </View>
    </DialogFrame>
  );
}
