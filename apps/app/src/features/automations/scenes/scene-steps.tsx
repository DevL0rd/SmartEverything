import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CommandAction } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Section } from '../../../components/section';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { DeviceValues } from '../../../store/state';
import { CommandFields } from '../editor/action-fields';
import { actionIcon } from '../editor/action-kinds';
import { BlockProblems, StepCard, movesOf } from '../editor/step-card';
import { deviceOptions } from '../editor/target-fields';
import { commandAction } from '../model/action-blanks';
import { writableCapabilities, type DeviceLike } from '../model/capability-choices';
import { describeAction } from '../model/describe-action';
import type { Names } from '../model/describe';
import { capturedActions, type SceneChange, type SceneDraft } from '../model/scene-state';

export interface StepsProps {
  readonly draft: SceneDraft;
  readonly change: (change: SceneChange) => void;
  readonly devices: readonly DeviceLike[];
  readonly valuesOf: (deviceId: string) => DeviceValues | undefined;
  readonly names: Names;
  readonly problems: readonly string[];
}

function settingsFor(device: DeviceLike, values: DeviceValues | undefined): CommandAction[] {
  const captured = capturedActions(device, values);
  if (captured.length > 0) {
    return captured;
  }
  const first = writableCapabilities(device)[0];
  return first === undefined ? [] : [commandAction(device, first)];
}

function AddDevice({ draft, change, devices, valuesOf }: StepsProps): ReactNode {
  const used = new Set(draft.actions.map((action) => action.deviceId));
  const offered = devices.filter(
    (device) => !used.has(device.id) && writableCapabilities(device).length > 0,
  );
  if (offered.length === 0) {
    return null;
  }
  return (
    <Select
      label="Add a device"
      showLabel={false}
      placeholder="Add a device"
      value={null}
      options={deviceOptions(offered)}
      onChange={(id) => {
        const device = offered.find((candidate) => candidate.id === id);
        if (device !== undefined) {
          change({ type: 'add', actions: settingsFor(device, valuesOf(device.id)) });
        }
      }}
    />
  );
}

function Capture({ draft, change, devices, valuesOf }: StepsProps): ReactNode {
  const ids = [...new Set(draft.actions.map((action) => action.deviceId))];
  return (
    <View className="gap-1">
      <View className="flex-row">
        <Button
          label="Capture current state"
          icon="camera"
          variant="outlined"
          disabled={ids.length === 0}
          onPress={() => {
            const captured = ids.flatMap((id) => {
              const device = devices.find((candidate) => candidate.id === id);
              return device === undefined ? [] : capturedActions(device, valuesOf(id));
            });
            change({ type: 'capture', captured });
          }}
        />
      </View>
      <Text variant="footnote" tone="variant" className="px-4">
        {ids.length === 0 ? 'Pick devices first.' : 'Copies how these devices are set right now.'}
      </Text>
    </View>
  );
}

export function SceneSteps(props: StepsProps): ReactNode {
  const { draft, change, devices, names } = props;
  return (
    <Section title="Devices">
      <View className="gap-3">
        {draft.actions.map((action, index) => (
          <StepCard
            key={`${String(index)}:${action.deviceId}:${action.capability}`}
            icon={actionIcon(action, devices)}
            kind={`Step ${String(index + 1)}`}
            summary={describeAction(names, action)}
            onRemove={() => {
              change({ type: 'remove', index });
            }}
            moves={
              draft.actions.length > 1
                ? movesOf(index, draft.actions.length, (by) => {
                    change({ type: 'move', index, by });
                  })
                : null
            }
          >
            <CommandFields
              action={action}
              devices={devices}
              onChange={(next) => {
                change({ type: 'set', index, action: next });
              }}
            />
          </StepCard>
        ))}
        <BlockProblems problems={props.problems} />
        <AddDevice {...props} />
        <Capture {...props} />
      </View>
    </Section>
  );
}
