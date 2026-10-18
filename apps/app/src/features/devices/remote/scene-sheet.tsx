import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { buttonLabel } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { saveScene } from '../../../api/scenes';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notifyFailure } from '../../../components/toast-store';
import { sameJson } from '../../../store/same-json';
import { useRows } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import {
  actionOf,
  SCENE_ICON,
  sceneGroupsOf,
  sceneReady,
  stepLabel,
  type SceneGroup,
  type SceneStep,
} from './scene-model';

const log = new Logger('app.devices');

function KeyChoices({
  group,
  onPick,
}: {
  readonly group: SceneGroup;
  readonly onPick: (step: SceneStep) => void;
}): ReactNode {
  return (
    <View className="gap-1.5">
      <Text variant="label" tone="variant">
        {group.name}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {group.steps.map((step) => (
          <Button
            key={step.key}
            label={buttonLabel(step.key)}
            variant="tonal"
            onPress={() => {
              onPick(step);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function Recorded({
  steps,
  onRemove,
}: {
  readonly steps: readonly SceneStep[];
  readonly onRemove: (index: number) => void;
}): ReactNode {
  if (steps.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        Tap the keys below in the order they should be sent.
      </Text>
    );
  }
  return (
    <View className="gap-0.5">
      {steps.map((step, index) => (
        <ListRow
          key={`${String(index)}-${step.key}`}
          title={`${String(index + 1)}. ${stepLabel(step)}`}
          trailing={
            <IconButton
              icon="close"
              label={`Remove ${stepLabel(step)}`}
              onPress={() => {
                onRemove(index);
              }}
            />
          }
        />
      ))}
    </View>
  );
}

function useSave(
  name: string,
  steps: readonly SceneStep[],
  onClose: () => void,
): { readonly saving: boolean; readonly save: () => void } {
  const [saving, setSaving] = useState(false);
  const position = useRows('scenes').length;
  return {
    saving,
    save: (): void => {
      const fail = notifyFailure('The scene wasn’t saved');
      setSaving(true);
      background(
        saveScene({
          sceneId: null,
          name: name.trim(),
          icon: SCENE_ICON,
          actions: steps.map(actionOf),
          position,
        })
          .then(() => {
            log.info('scene.recorded', { steps: steps.length });
            onClose();
          })
          .catch((error: unknown) => {
            log.error('scene.record_failed', error);
            fail(error);
            setSaving(false);
          }),
        'scene_sheet.save_failed',
      );
    },
  };
}

function Footer({
  onClose,
  saving,
  ready,
  save,
}: {
  readonly onClose: () => void;
  readonly saving: boolean;
  readonly ready: boolean;
  readonly save: () => void;
}): ReactNode {
  return (
    <>
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button label="Save" loading={saving} disabled={!ready} onPress={save} />
    </>
  );
}

export function SceneSheet({
  blaster,
  onClose,
}: {
  readonly blaster: Device;
  readonly onClose: () => void;
}): ReactNode {
  const groups = useStoreSelector((state) => sceneGroupsOf(state, blaster.id), sameJson, [
    blaster.id,
  ]);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<readonly SceneStep[]>([]);
  const { saving, save } = useSave(name, steps, onClose);
  const add = (step: SceneStep): void => {
    setSteps((current) => [...current, step]);
  };
  const remove = (index: number): void => {
    setSteps((current) => current.filter((_, at) => at !== index));
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Make a scene"
      detents={['half', 'full']}
      footer={
        <Footer onClose={onClose} saving={saving} ready={sceneReady(name, steps)} save={save} />
      }
    >
      <View className="gap-4">
        <TextField label="Name" placeholder="Movie night" value={name} onChange={setName} />
        <Recorded steps={steps} onRemove={remove} />
        {groups.map((group) => (
          <KeyChoices key={group.id} group={group} onPick={add} />
        ))}
      </View>
    </Sheet>
  );
}
