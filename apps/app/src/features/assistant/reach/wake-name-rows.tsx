import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { useCameraEntries } from '../../cameras';
import { useAssistantName } from '../data/assistant-data';
import { useReachUpdate } from './reach-data';
import { ReachLoaded, unsaved } from './reach-loaded';

export function WakeNameRows(): ReactNode {
  const entries = useCameraEntries();
  const update = useReachUpdate();
  const name = useAssistantName();
  return (
    <ReachLoaded>
      {(settings) => {
        const allowed = entries.filter((entry) => settings.cameras.includes(entry.device.id));
        if (allowed.length === 0) {
          return <ListRow title="No cameras the AI may talk through" icon="cameras" disabled />;
        }
        return allowed.map((entry) => {
          const listening = !settings.wakeOff.includes(entry.device.id);
          return (
            <SwitchRow
              key={entry.device.id}
              title={entry.name}
              subtitle={`Hears “hey ${name}”`}
              icon="cameras"
              value={listening}
              onChange={(value) => {
                const others = settings.wakeOff.filter((id) => id !== entry.device.id);
                update({ wakeOff: value ? others : [...others, entry.device.id] }).catch(unsaved);
              }}
            />
          );
        });
      }}
    </ReachLoaded>
  );
}
