import type { ReactNode } from 'react';
import type { BodyReadingRow, ProfileRow } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { ListRow } from '../../components/list-row';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { SelectRow } from '../../components/rows';
import { isLocalScale, useProfiles } from '../../store/people';
import { useDevices, useIsOwner, useRows } from '../../store/selectors';
import { useProfileSave } from './body-details';
import { PhoneListeningRows } from './phone-listening-row';
import { NO_SLOT, slotChoices, slotOf } from './scale-slots';

function SlotRows(): ReactNode {
  const profiles = useProfiles();
  const readings = useRows('body_readings');
  return (
    <>
      {profiles.map((profile) => (
        <SlotRow key={profile.id} profile={profile} profiles={profiles} readings={readings} />
      ))}
    </>
  );
}

function SlotRow({
  profile,
  profiles,
  readings,
}: {
  readonly profile: ProfileRow;
  readonly profiles: readonly ProfileRow[];
  readonly readings: readonly BodyReadingRow[];
}): ReactNode {
  const { save } = useProfileSave(profile.id);
  return (
    <SelectRow
      icon="user"
      title={`${profile.name} on the scale`}
      options={slotChoices(readings, profiles, profile.scale_user)}
      value={profile.scale_user === null ? NO_SLOT : String(profile.scale_user)}
      onChange={(choice) => {
        save({ scale_user: slotOf(choice) });
      }}
    />
  );
}

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
      {owner ? <SlotRows /> : null}
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
