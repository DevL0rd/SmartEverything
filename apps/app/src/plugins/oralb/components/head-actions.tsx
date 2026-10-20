import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ReasonLine } from '../../../components/reason-line';
import { cn } from '../../../design/cn';
import { useBrushAct } from '../../toothbrush/data/brush-act';
import { useOralbConfig } from '../data/use-oralb';
import { LOCK_NOTICE, gateOf } from '../model/settings-model';

export function HeadActions({
  deviceId,
  view,
  right,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
  readonly right: boolean;
}): ReactNode {
  const { oralb, consent } = useOralbConfig(deviceId);
  const { act, busy } = useBrushAct(deviceId);
  const gate = gateOf(oralb, 'head', view.handle.oralb?.firmware ?? null, consent);
  const open = gate.open && view.mayConfigure;
  return (
    <View className="gap-2">
      <View className={cn('flex-row flex-wrap items-center gap-3', right && 'justify-end')}>
        <Button
          label="I replaced the head"
          variant="tonal"
          icon={open ? 'check' : 'lock'}
          disabled={!open || busy}
          onPress={() => {
            act({ action: 'reset_head_reminder' }, 'The reminder could not be reset', true);
          }}
        />
        <Button
          label="Snooze"
          variant="text"
          disabled={!open || busy}
          onPress={() => {
            act({ action: 'snooze_head_reminder' }, 'The reminder could not be snoozed', true);
          }}
        />
      </View>
      {open ? null : (
        <ReasonLine
          icon="lock"
          text={view.mayConfigure ? LOCK_NOTICE : 'Only the owner can change the brush.'}
        />
      )}
    </View>
  );
}
