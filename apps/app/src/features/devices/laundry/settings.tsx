import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { controlCount } from '../model/control-groups';
import { RoleSwitch } from './parts';
import type { Laundry } from './use-laundry';

function Link({
  label,
  to,
}: {
  readonly label: string;
  readonly to: ReturnType<typeof href.deviceSection>;
}): ReactNode {
  return (
    <Interactive label={label} href={to} className="min-h-touch-min justify-center self-start">
      <Text variant="body-strong" className="underline">
        {label}
      </Text>
    </Interactive>
  );
}

function Rows({ laundry }: { readonly laundry: Laundry }): ReactNode {
  const total = controlCount(laundry.presentation);
  return (
    <View className="gap-1">
      <RoleSwitch
        laundry={laundry}
        source="child_lock"
        title="Child lock"
        sub="Locks the machine’s own buttons."
      />
      <RoleSwitch laundry={laundry} source="buzzer" title="Button sounds" />
      <RoleSwitch
        laundry={laundry}
        source="drum_light"
        title="Drum light"
        sub="Lights the drum while the door is open."
      />
      <RoleSwitch laundry={laundry} source="noise_reduction" title="Noise reduction" />
      <RoleSwitch
        laundry={laundry}
        source="detergent_reminder"
        title="Machine beeps when detergent is low"
      />
      <RoleSwitch
        laundry={laundry}
        source="softener_reminder"
        title="Machine beeps when softener is low"
      />
      <RoleSwitch
        laundry={laundry}
        source="one_click"
        title="One-click wash"
        sub="The machine starts its favourite when you press the button."
      />
      <Link
        label={`All controls (${String(total)}) ›`}
        to={href.deviceSection(laundry.device.id, 'controls')}
      />
      <Link label="Diagnostics ›" to={href.settings.device(laundry.device.id, 'diagnostics')} />
    </View>
  );
}

export function SettingsCard({
  laundry,
  collapsible,
}: {
  readonly laundry: Laundry;
  readonly collapsible: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (!collapsible) {
    return (
      <Card title="Settings">
        <Rows laundry={laundry} />
      </Card>
    );
  }
  return (
    <Card
      title="Machine settings"
      action={
        <IconButton
          icon={open ? 'chevronUp' : 'chevronDown'}
          label={open ? 'Hide machine settings' : 'Show machine settings'}
          variant="standard"
          onPress={() => {
            setOpen(!open);
          }}
        />
      }
    >
      {open ? <Rows laundry={laundry} /> : null}
    </Card>
  );
}
