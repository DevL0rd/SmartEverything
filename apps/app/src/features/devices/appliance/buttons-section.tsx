import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { saveIrApplianceKey } from '../../../api/ir-appliances';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { LearnSheet } from '../device-settings/learn-sheet';
import { canLearn } from '../model/remote-layout';
import {
  applianceButtons,
  applianceOf,
  type Appliance,
  type ApplianceButton,
} from './appliance-model';
import { BlasterPicker } from './blaster-picker';

function blasterState(blaster: Device | null): string {
  if (blaster === null) {
    return 'Removed';
  }
  return blaster.online ? 'Online' : 'Offline';
}

function BlasterBlock({
  device,
  appliance,
  blaster,
}: {
  readonly device: Device;
  readonly appliance: Appliance;
  readonly blaster: Device | null;
}): ReactNode {
  const [picking, setPicking] = useState(false);
  const open = (): void => {
    setPicking(true);
  };
  return (
    <>
      <List title="Sends through">
        <ListRow
          title={blaster === null ? 'No blaster' : blaster.label}
          subtitle={blasterState(blaster)}
          icon="remote"
          trailing={<Button label="Use another blaster" variant="tonal" onPress={open} />}
        />
      </List>
      {picking ? (
        <BlasterPicker
          appliance={appliance}
          name={device.label}
          onClose={() => {
            setPicking(false);
          }}
        />
      ) : null}
    </>
  );
}

function ButtonRow({
  button,
  onLearn,
}: {
  readonly button: ApplianceButton;
  readonly onLearn: ((name: string) => void) | null;
}): ReactNode {
  const learned = button.learned !== null;
  return (
    <ListRow
      title={button.name}
      subtitle={learned ? 'Learned' : 'Not learned'}
      subtitleTone={learned ? 'positive' : 'variant'}
      icon={learned ? 'circleCheck' : 'circle'}
      iconTone={learned ? 'positive' : 'variant'}
      trailing={
        onLearn === null ? undefined : (
          <Button
            label={learned ? 'Learn again' : 'Learn'}
            spoken={`Learn ${button.name}`}
            variant={learned ? 'text' : 'tonal'}
            onPress={() => {
              onLearn(button.learned ?? button.name);
            }}
          />
        )
      }
    />
  );
}

function ApplianceLearnSheet({
  blaster,
  device,
  appliance,
  initial,
  missing,
  onClose,
}: {
  readonly blaster: Device;
  readonly device: Device;
  readonly appliance: Appliance;
  readonly initial: string;
  readonly missing: readonly string[];
  readonly onClose: () => void;
}): ReactNode {
  return (
    <LearnSheet
      blaster={blaster}
      name={device.label}
      initial={initial}
      suggestions={missing}
      target={{
        id: appliance.id,
        save: async (button, code) => {
          await saveIrApplianceKey({ applianceId: appliance.id, button, ...code });
        },
      }}
      onClose={onClose}
    />
  );
}

function learnHint(device: Device, learns: boolean): { readonly footer?: string } {
  return learns
    ? { footer: `Point the ${device.label} remote at the blaster and learn each button once.` }
    : {};
}

function ButtonList({
  device,
  appliance,
  blaster,
}: {
  readonly device: Device;
  readonly appliance: Appliance;
  readonly blaster: Device | null;
}): ReactNode {
  const [learning, setLearning] = useState<string | null>(null);
  const buttons = applianceButtons(device, appliance.category);
  const learner = blaster !== null && canLearn(blaster.capabilities) ? blaster : null;
  const onLearn = learner === null ? null : setLearning;
  return (
    <>
      <List title="Buttons" {...learnHint(device, onLearn !== null)}>
        {buttons.map((button) => (
          <ButtonRow key={button.name} button={button} onLearn={onLearn} />
        ))}
        {onLearn === null ? null : (
          <ListRow
            title="Learn another button"
            icon="plus"
            onPress={() => {
              setLearning('');
            }}
          />
        )}
      </List>
      {learner === null || learning === null ? null : (
        <ApplianceLearnSheet
          blaster={learner}
          device={device}
          appliance={appliance}
          initial={learning}
          missing={buttons.filter((button) => button.learned === null).map(({ name }) => name)}
          onClose={() => {
            setLearning(null);
          }}
        />
      )}
    </>
  );
}

function ApplianceButtons({
  device,
  appliance,
}: {
  readonly device: Device;
  readonly appliance: Appliance;
}): ReactNode {
  const blaster = useRow('devices', appliance.blasterId);
  return (
    <View className="gap-section-gap">
      <BlasterBlock device={device} appliance={appliance} blaster={blaster} />
      <ButtonList device={device} appliance={appliance} blaster={blaster} />
    </View>
  );
}

export function ButtonsSection({ device }: { readonly device: Device }): ReactNode {
  const appliance = applianceOf(device);
  return appliance === null ? null : <ApplianceButtons device={device} appliance={appliance} />;
}
