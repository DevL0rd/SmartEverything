import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { SCHEDULED_AI_STEPS_REASON } from '@smarteverything/domain';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List, Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { useMinute } from '../../../store/clock';
import { useDeviceValue } from '../../../store/selectors';
import { useCatalog } from '../data/use-automations';
import { ActionSteps } from '../editor/action-steps';
import { NotFound } from '../screens/not-found';
import { powerActions, STEP_ACTION_TYPES } from './steps';
import { useHomeZone, useScheduleRow } from './use-scheduled';
import {
  draftOf,
  newDraft,
  useScheduleEditor,
  type ScheduleDraft,
  type ScheduleEditor,
} from './use-schedule-editor';
import { titleOf } from './view';
import { WhenPicker } from './when-picker';

const PARAMS = z.object({ scheduleId: z.string().optional(), deviceId: z.string().optional() });

function StepsBlock({ editor }: { readonly editor: ScheduleEditor }): ReactNode {
  const catalog = useCatalog();
  const actions = editor.draft.actions;
  return (
    <Section title="Do">
      {actions === null ? (
        <Text variant="callout" tone="variant" className="px-4">
          These steps were made by the assistant and can’t be changed here. You can still change the
          name and time.
        </Text>
      ) : (
        <ActionSteps
          actions={actions}
          catalog={catalog}
          types={STEP_ACTION_TYPES}
          problems={editor.problem === null ? [] : [editor.problem]}
          onChange={editor.changeActions}
        />
      )}
      <List inset>
        <ListRow title="Ask the AI" subtitle={SCHEDULED_AI_STEPS_REASON} icon="sparkles" disabled />
      </List>
    </Section>
  );
}

function WhenBlock({ editor }: { readonly editor: ScheduleEditor }): ReactNode {
  const when = editor.draft.when;
  return (
    <Section title="When">
      <Card>
        {when === null ? (
          <Text variant="callout" tone="variant">
            This one runs at several set times; they stay as they are.
          </Text>
        ) : (
          <WhenPicker value={when} onChange={editor.setWhen} />
        )}
      </Card>
    </Section>
  );
}

function SaveBar({
  editor,
  label,
}: {
  readonly editor: ScheduleEditor;
  readonly label: string;
}): ReactNode {
  const { width } = useSizeClass();
  return (
    <View className="w-full max-w-reading flex-row justify-end self-center">
      <Button
        label={label}
        icon="check"
        grow={width === 'compact'}
        loading={editor.saving}
        onPress={editor.save}
      />
    </View>
  );
}

function Editor({
  start,
  savedId,
  title,
}: {
  readonly start: ScheduleDraft;
  readonly savedId: string | null;
  readonly title: string;
}): ReactNode {
  const editor = useScheduleEditor(start, savedId);
  const touch = useIdiom() === 'touch';
  const saveLabel = savedId === null ? 'Schedule' : 'Save';
  return (
    <Screen
      maxWidth="reading"
      header={
        <PageHeader
          title={title}
          actions={
            touch ? [] : [{ icon: 'check', label: saveLabel, primary: true, onPress: editor.save }]
          }
        />
      }
      {...(touch ? { footer: <SaveBar editor={editor} label={saveLabel} /> } : {})}
    >
      <TextField
        label="Name (optional)"
        value={editor.draft.label}
        placeholder="Fan off after my shower"
        onChange={editor.setLabel}
      />
      <WhenBlock editor={editor} />
      <StepsBlock editor={editor} />
    </Screen>
  );
}

function NewForDevice({ deviceId }: { readonly deviceId: string }): ReactNode {
  const power = useDeviceValue(deviceId, 'power');
  const [start] = useState(() =>
    newDraft(power === null ? [] : powerActions(deviceId, power.value !== true)),
  );
  return <Editor start={start} savedId={null} title="Schedule something" />;
}

function EditExisting({ scheduleId }: { readonly scheduleId: string }): ReactNode {
  const row = useScheduleRow(scheduleId);
  const zone = useHomeZone();
  const now = useMinute();
  const [start] = useState(() => (row === null ? null : draftOf(row, zone, now)));
  if (row === null || start === null) {
    return (
      <NotFound title="This scheduled action is gone" body="It may have run or been cancelled." />
    );
  }
  return <Editor start={start} savedId={row.id} title={`Edit ${titleOf(row)}`} />;
}

export function ScheduledEditorScreen(): ReactNode {
  useHideNavigation();
  const params = PARAMS.safeParse(useLocalSearchParams());
  if (!params.success) {
    return <NotFound title="Not found" body="This link doesn’t point to a scheduled action." />;
  }
  const { scheduleId, deviceId } = params.data;
  if (scheduleId !== undefined) {
    return <EditExisting scheduleId={scheduleId} />;
  }
  return deviceId === undefined ? (
    <Editor start={newDraft([])} savedId={null} title="Schedule something" />
  ) : (
    <NewForDevice deviceId={deviceId} />
  );
}
