import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { useCameraEntries } from '../../cameras';
import { useReachUpdate } from './reach-data';
import { ReachLoaded, unsaved } from './reach-loaded';

export function CameraAllowRows(): ReactNode {
  const entries = useCameraEntries();
  const update = useReachUpdate();
  if (entries.length === 0) {
    return <ListRow title="No cameras yet" icon="cameras" disabled />;
  }
  return (
    <ReachLoaded>
      {(settings) =>
        entries.map((entry) => {
          const allowed = settings.cameras.includes(entry.device.id);
          return (
            <SwitchRow
              key={entry.device.id}
              title={entry.name}
              {...(entry.room === null ? {} : { subtitle: entry.room })}
              icon="cameras"
              value={allowed}
              onChange={(value) => {
                const others = settings.cameras.filter((id) => id !== entry.device.id);
                update({ cameras: value ? [...others, entry.device.id] : others }).catch(unsaved);
              }}
            />
          );
        })
      }
    </ReachLoaded>
  );
}
