import type { ReactNode } from 'react';
import { List } from '../../components/section';
import { ListRow } from '../../components/list-row';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { useRows } from '../../store/selectors';
import type { Device } from '../../store/state';
import { PhoneListeningRows } from './phone-listening-row';

export function ScaleStatus({ scale }: { readonly scale: Device }): ReactNode {
  const now = useMinute();
  const heard = scale.details['lastHeardAt'];
  const latest = useRows('body_readings').find((reading) => reading.device_id === scale.id);
  return (
    <List title="Listening">
      <PhoneListeningRows />
      <ListRow
        title="Your server"
        subtitle={
          typeof heard === 'string'
            ? `Last broadcast received ${relative(heard, now)}`
            : 'No broadcast received yet'
        }
        icon="server"
      />
      {latest === undefined ? null : (
        <ListRow title="Last weigh-in" subtitle={relative(latest.measured_at, now)} icon="scale" />
      )}
    </List>
  );
}
