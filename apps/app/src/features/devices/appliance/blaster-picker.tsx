import type { ReactNode } from 'react';
import { Logger, background } from '@smarteverything/logging';
import { rebindIrAppliance } from '../../../api/ir-appliances';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { notify } from '../../../components/toast-store';
import { useDevices } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { blasterChoices, type Appliance } from './appliance-model';

const log = new Logger('app.devices');

async function rebind(appliance: Appliance, name: string, blaster: Device): Promise<void> {
  try {
    await rebindIrAppliance(appliance.id, blaster.id);
  } catch (error: unknown) {
    log.error('appliance.rebind_failed', error, {
      applianceId: appliance.id,
      blasterId: blaster.id,
    });
    notify({ message: `${name} still sends through its old blaster`, error, tone: 'critical' });
  }
}

export function BlasterPicker({
  appliance,
  name,
  onClose,
}: {
  readonly appliance: Appliance;
  readonly name: string;
  readonly onClose: () => void;
}): ReactNode {
  const choices = blasterChoices(useDevices(), appliance.blasterId);
  return (
    <Sheet open onClose={onClose} title="Use another blaster" detents={['fit']}>
      {choices.length === 0 ? (
        <EmptyState
          icon="remote"
          title="No other IR blaster"
          body="Add another IR blaster to your home to send through it."
        />
      ) : (
        <List footer={`${name} sends its buttons through the blaster you pick.`}>
          {choices.map((blaster) => (
            <ListRow
              key={blaster.id}
              title={blaster.label}
              subtitle={blaster.online ? 'Online' : 'Offline'}
              icon="remote"
              chevron
              onPress={() => {
                onClose();
                background(rebind(appliance, name, blaster), 'appliance.rebind_failed');
              }}
            />
          ))}
        </List>
      )}
    </Sheet>
  );
}
