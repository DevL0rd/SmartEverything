import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { SwitchRow } from '../../components/rows';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { ScheduleCallEditor } from './schedule-call-editor';
import { OperationFeedback } from './operation-feedback';
import { useScheduleDraft, type ScheduleRow } from './use-schedule-draft';
import { ScheduleTimeBuilder } from './schedule-time-builder';
export type { ScheduleRow } from './use-schedule-draft';

export function ScheduleEditor({
  sensor,
  row,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly row: ScheduleRow | null;
  readonly close: () => void;
}): ReactNode {
  const draft = useScheduleDraft(sensor, row);
  return (
    <View className="gap-3">
      <Text tone="variant">Runs on this Shelly · uses its local clock and location.</Text>
      <SwitchRow title="Schedule enabled" value={draft.enable} onChange={draft.setEnable} />
      <ScheduleTimeBuilder change={draft.setTimespec} />
      <TextField
        label="Schedule expression"
        value={draft.timespec}
        onChange={draft.setTimespec}
        helper="Preserves complete supported cron and sun expressions"
      />
      <KnownScheduleCalls row={row} draft={draft} />
      <Button
        label="Preview schedule times"
        variant="tonal"
        onPress={() => {
          void draft.operation.run({ action: 'schedule_eval', timespec: draft.timespec });
        }}
      />
      {draft.error === null ? null : <Text tone="critical">{draft.error}</Text>}
      <OperationFeedback operation={draft.operation} />
      {draft.conflict ? (
        <Text tone="warning">Configuration changed. Reopen this schedule before saving.</Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          label="Save schedule"
          loading={draft.operation.busy}
          disabled={draft.conflict || sensor.connection.state !== 'online'}
          onPress={draft.save}
        />
        <Button label="Back" variant="text" onPress={close} />
      </View>
      <DeleteSchedule row={row} draft={draft} close={close} />
    </View>
  );
}

function DeleteSchedule({
  row,
  draft,
  close,
}: {
  readonly row: ScheduleRow | null;
  readonly draft: ReturnType<typeof useScheduleDraft>;
  readonly close: () => void;
}): ReactNode {
  return row === null ? null : (
    <Button
      label="Delete schedule"
      variant="destructive"
      onPress={() => {
        void draft.operation.run({ action: 'schedule_delete', id: row.id }).then((saved) => {
          if (saved) close();
        });
      }}
    />
  );
}

function KnownScheduleCalls({
  row,
  draft,
}: {
  readonly row: ScheduleRow | null;
  readonly draft: ReturnType<typeof useScheduleDraft>;
}): ReactNode {
  if (row !== null && row.unavailableCalls.length > 0)
    return (
      <View className="gap-2">
        <Text tone="warning">
          This schedule contains protected or unsupported actions: {row.unavailableCalls.join(', ')}
          . Their accepted parameters stay on the device. You can change its time or enabled state.
        </Text>
      </View>
    );
  return <ScheduleCallEditor value={draft.calls} change={draft.setCalls} />;
}
