import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Checkbox } from '../../components/checkbox';
import { SectionAction } from '../../components/section';
import { SearchField } from '../../components/search-field';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { useRooms } from '../../store/selectors';
import { deviceIcon } from '../device-visuals';
import type { Device } from '../../store/state';
import {
  memberSections,
  missingMembers,
  selectedIn,
  withDevice,
  withSection,
  type MemberSection,
} from './group-members';

interface Props {
  readonly devices: readonly Device[];
  readonly members: readonly string[];
  readonly busy: boolean;
  readonly onChange: (members: readonly string[]) => void;
}

function SectionHeading({
  section,
  members,
  busy,
  onChange,
}: Pick<Props, 'members' | 'busy' | 'onChange'> & {
  readonly section: MemberSection;
}): ReactNode {
  const selected = selectedIn(members, section);
  const all = selected === section.devices.length;
  return (
    <View className="flex-row items-end justify-between gap-2 pt-2">
      <Text variant="footnote" tone="variant" accessibilityRole="header" className="pb-1">
        {`${section.title} · ${String(selected)} of ${String(section.devices.length)}`}
      </Text>
      {busy ? null : (
        <SectionAction
          label={all ? `Clear ${section.title}` : `Select all in ${section.title}`}
          onPress={() => {
            onChange(withSection(members, section, !all));
          }}
        />
      )}
    </View>
  );
}

function PickerSection({
  section,
  members,
  busy,
  onChange,
}: Pick<Props, 'members' | 'busy' | 'onChange'> & {
  readonly section: MemberSection;
}): ReactNode {
  return (
    <View>
      <SectionHeading section={section} members={members} busy={busy} onChange={onChange} />
      {section.devices.map((device) => (
        <Checkbox
          key={device.id}
          label={device.label}
          icon={deviceIcon(device)}
          checked={members.includes(device.id)}
          disabled={busy}
          onChange={(checked) => {
            onChange(withDevice(members, device.id, checked));
          }}
        />
      ))}
    </View>
  );
}

export function MemberPicker({ devices, members, busy, onChange }: Props): ReactNode {
  const rooms = useRooms();
  const [text, setText] = useState('');
  const [hidden, setHidden] = useState(false);
  const sections = memberSections(devices, rooms, members, { text, hidden });
  return (
    <View className="gap-1">
      <SearchField
        value={text}
        onChange={setText}
        placeholder="Search devices or rooms"
        variant="field"
      />
      <View className="min-h-touch-min flex-row items-center justify-between gap-3">
        <Text variant="body">Show hidden devices</Text>
        <Switch label="Show hidden devices" value={hidden} onChange={setHidden} />
      </View>
      {sections.map((section) => (
        <PickerSection
          key={section.key}
          section={section}
          members={members}
          busy={busy}
          onChange={onChange}
        />
      ))}
      {sections.length === 0 ? (
        <Text variant="callout" tone="variant">
          No devices match.
        </Text>
      ) : null}
      {missingMembers(devices, members).map((id) => (
        <Checkbox
          key={id}
          label="Removed device"
          checked
          disabled={busy}
          onChange={() => {
            onChange(withDevice(members, id, false));
          }}
        />
      ))}
    </View>
  );
}
