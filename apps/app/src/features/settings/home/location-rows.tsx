import type { ReactNode } from 'react';
import { deviceTimeZone } from '../../../platform/time-zone';
import { useState } from 'react';
import { updateHome } from '../../../api/settings';
import { ListRow } from '../../../components/list-row';
import { ActionRow, SelectRow, ValueRow } from '../../../components/rows';
import { notifyFailure } from '../../../components/toast-store';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { zoneLabel } from '../../../format/time';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import { timeZoneOptions } from './place';

import { trackSetting } from '../settings-log';
function TypedTimeZone({ zone }: { readonly zone: string }): ReactNode {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <ListRow
        title="Time zone"
        icon="clock"
        value={zoneLabel(zone)}
        chevron
        onPress={() => {
          setEditing(true);
        }}
      />
      <TextEditSheet
        request={
          editing
            ? {
                title: 'Time zone',
                label: 'Time zone name',
                initial: zone,
                placeholder: 'Region/City',
                confirmLabel: 'Save',
                maxLength: 64,
                save: (time_zone) => updateHome({ time_zone }),
              }
            : null
        }
        onClose={() => {
          setEditing(false);
        }}
      />
    </>
  );
}

export function TimeZoneRow(): ReactNode {
  const zone = useSettings().time_zone;
  const owner = useIsOwner();
  const options = timeZoneOptions();
  if (!owner) {
    return <ValueRow title="Time zone" icon="clock" value={zoneLabel(zone)} />;
  }
  if (options === null) {
    return <TypedTimeZone zone={zone} />;
  }
  return (
    <SelectRow
      title="Time zone"
      icon="clock"
      options={options}
      value={zone}
      searchable
      onChange={(time_zone) => {
        trackSetting('home_time_zone.set', {}, () => updateHome({ time_zone })).catch(
          notifyFailure('The time zone was not changed'),
        );
      }}
    />
  );
}

export function DeviceTimeZoneRow(): ReactNode {
  const device = deviceTimeZone();
  return (
    <ActionRow
      title={`Use ${zoneLabel(device)}`}
      subtitle="This device's time zone"
      icon="globe"
      onPress={() => {
        trackSetting('home_time_zone.set_device', {}, () =>
          updateHome({ time_zone: device }),
        ).catch(notifyFailure('The time zone was not changed'));
      }}
    />
  );
}
