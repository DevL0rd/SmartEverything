import type { ReactNode } from 'react';
import { href } from '../../app-shell/hrefs';
import { ListRow } from '../../components/list-row';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { isLocalScale } from '../../store/people';
import { useDevices, useIsOwner } from '../../store/selectors';
import { PhoneListeningRows } from './phone-listening-row';

export function ScaleBlock(): ReactNode {
  const now = useMinute();
  const owner = useIsOwner();
  const scales = useDevices({ includeHidden: true }).filter(isLocalScale);
  if (scales.length === 0) {
    return owner ? (
      <ListRow
        title="Add a Bluetooth scale"
        subtitle="Your phones hear each weigh-in and save it to the right person"
        icon="scale"
        href={href.connect('scale')}
        chevron
      />
    ) : null;
  }
  return (
    <>
      <PhoneListeningRows />
      {scales.map((scale) => {
        const heard = scale.details['lastHeardAt'];
        return (
          <ListRow
            key={scale.id}
            title={scale.display_name ?? scale.name}
            subtitle={
              typeof heard === 'string'
                ? `Last weigh-in heard ${relative(heard, now)}`
                : 'Waiting for the first weigh-in'
            }
            icon="scale"
            href={href.settings.device(scale.id)}
            chevron
          />
        );
      })}
    </>
  );
}
