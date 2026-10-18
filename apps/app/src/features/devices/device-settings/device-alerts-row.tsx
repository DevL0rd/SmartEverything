import type { ReactNode } from 'react';
import { deviceAlertsOn, withDeviceAlerts } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { PREFS, usePref } from '../../../store/prefs';

export function DeviceAlertsRow({ deviceId }: { readonly deviceId: string }): ReactNode {
  const pref = usePref(PREFS.deviceAlerts);
  if (pref.status === 'invalid') {
    return (
      <ListRow
        icon="bell"
        title="Alerts"
        subtitle="This setting couldn’t be read"
        subtitleTone="critical"
        trailing={<Button label="Reset" variant="tonal" onPress={pref.reset} />}
      />
    );
  }
  return (
    <SwitchRow
      title="Alerts"
      subtitle="Doorbell, calls, alarms and leaks from this device reach your phones"
      icon="bell"
      value={deviceAlertsOn(pref.value, deviceId)}
      onChange={(on) => {
        pref.set(withDeviceAlerts(pref.value, deviceId, on));
      }}
    />
  );
}
