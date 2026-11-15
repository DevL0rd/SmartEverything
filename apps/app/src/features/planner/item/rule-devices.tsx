import { deviceFamily, type PlannerCompletion } from '@smarteverything/domain';
import { useMemo, useState, type ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { useDevices } from '../../../store/selectors';
import { deviceGroupsOf, useAttachmentNames, type PickEntry } from './attachment-chips';
import { familyRuleOf, hasFamilyRule, sameRule, type RuleDevice } from './completion-rule-row';

export type RuleDevices = ReadonlyMap<string, RuleDevice>;

export function useRuleDevices(): RuleDevices {
  const devices = useDevices({ includeHidden: true });
  return useMemo(
    () =>
      new Map(
        devices.map((device) => [
          device.id,
          { id: device.id, label: device.label, family: deviceFamily(device) },
        ]),
      ),
    [devices],
  );
}

function useDeviceEntries(): readonly PickEntry[] {
  const all = useDevices();
  const names = useAttachmentNames();
  const fitting = all.filter((device) => hasFamilyRule(deviceFamily(device)));
  const groups = deviceGroupsOf(fitting, names, { taken: new Set(), text: '' }, null);
  return [...groups.suggested, ...groups.rest];
}

function deviceRows(
  entries: readonly PickEntry[],
  disabled: boolean,
  onPick: (id: string) => void,
): ReactNode {
  if (entries.length === 0) {
    return (
      <ListRow
        key="none"
        wrapTitle
        title="No toothbrush, treadmill or bottle yet"
        icon="info"
        iconTone="variant"
      />
    );
  }
  return entries.map((entry) => (
    <ListRow
      key={entry.id}
      wrapTitle
      title={entry.title}
      {...(entry.subtitle === null ? {} : { subtitle: entry.subtitle })}
      icon={entry.icon}
      iconTone="variant"
      disabled={disabled}
      onPress={() => {
        onPick(entry.id);
      }}
    />
  ));
}

export interface DeviceChooserInput {
  readonly devices: RuleDevices;
  readonly current: PlannerCompletion;
  readonly disabled: boolean;
  readonly onChange: (completion: PlannerCompletion) => void;
}

export function useDeviceChooser({
  devices,
  current,
  disabled,
  onChange,
}: DeviceChooserInput): readonly ReactNode[] {
  const entries = useDeviceEntries();
  const [choosing, setChoosing] = useState(false);
  const pick = (id: string): void => {
    const picked = devices.get(id);
    const rule = picked === undefined ? null : familyRuleOf(picked);
    setChoosing(false);
    if (rule !== null && !sameRule(rule, current)) onChange(rule);
  };
  return [
    <ListRow
      key="choose"
      wrapTitle
      title="Choose a device…"
      subtitle="A toothbrush, treadmill or bottle checks it off"
      icon="cpu"
      iconTone="variant"
      expanded={choosing}
      chevron
      disabled={disabled}
      onPress={() => {
        setChoosing(!choosing);
      }}
    />,
    choosing ? deviceRows(entries, disabled, pick) : null,
  ];
}
