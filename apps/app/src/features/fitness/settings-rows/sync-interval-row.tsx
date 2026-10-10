import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { SelectRow } from '../../../components/rows';
import { Button } from '../../../components/button';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { PREFS, usePref } from '../../../store/prefs';
import { scheduleSync } from '../data/health-connect';
import { SYNC_INTERVAL_OPTIONS, syncIntervalOf } from '../model/sources';

export function SyncIntervalRow(): ReactNode {
  const pref = usePref(PREFS.healthSync);
  if (pref.status === 'invalid') {
    return (
      <ListRow
        icon="clock"
        title="Background sync"
        subtitle="This setting couldn’t be read"
        subtitleTone="critical"
        trailing={<Button label="Reset" variant="tonal" onPress={pref.reset} />}
      />
    );
  }
  return (
    <SelectRow
      icon="clock"
      title="Background sync"
      options={SYNC_INTERVAL_OPTIONS}
      value={String(pref.value.intervalMinutes)}
      onChange={(choice) => {
        const intervalMinutes = syncIntervalOf(choice);
        scheduleSync(intervalMinutes).then(
          () => {
            pref.set({ intervalMinutes });
          },
          (error: unknown) => {
            const text = errorText(error);
            notify({
              message: 'Background sync was not changed',
              detail: text.detail,
              tone: 'critical',
            });
          },
        );
      }}
    />
  );
}
