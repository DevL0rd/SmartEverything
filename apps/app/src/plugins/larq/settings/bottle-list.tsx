import type { BottleSettingsView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SelectRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { millilitres } from '../../../format/number';
import { shortDate, startOfDayKey } from '../../../format/time';
import { useProfiles } from '../../../store/people';
import { useBottleAct } from '../data/bottle-act';
import { Anchored } from './anchored';
import { BodyPicker } from './body-picker';

const NOBODY = '';

const WHOSE_FOOTER = "Drinks go into this person's water log and Health Connect.";

const NOBODY_HINT = 'Readings are kept. Drinks are added when you choose a person.';

function Whose({ view }: { readonly view: BottleSettingsView }): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  const profiles = useProfiles();
  const name = view.person?.name ?? 'Nobody yet';
  if (!view.mayBind) {
    return (
      <ValueRow
        icon="user"
        title="Whose drinks"
        {...(view.person === null ? { subtitle: NOBODY_HINT, wrapSubtitle: true } : {})}
        value={name}
      />
    );
  }
  return (
    <Anchored deviceId={view.deviceId} id="person" label="Whose drinks">
      <SelectRow
        icon="user"
        title="Whose drinks"
        {...(view.person === null ? { subtitle: NOBODY_HINT, wrapSubtitle: true } : {})}
        options={[
          { value: NOBODY, label: 'Nobody yet' },
          ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
        ]}
        value={view.person?.id ?? NOBODY}
        onChange={(id) => {
          act(
            { action: 'bind_person', personId: id === NOBODY ? null : id },
            'Could not change whose drinks these are',
          );
        }}
      />
    </Anchored>
  );
}

function FilterTypeRows({ view }: { readonly view: BottleSettingsView }): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  const { filterConfig } = view;
  if (!filterConfig.installed) {
    return null;
  }
  return (
    <>
      <SelectRow
        icon="droplet"
        title="Filter type"
        options={[
          { value: 'essential', label: 'Essential (94 L, 60 days)' },
          { value: 'advanced', label: 'Advanced (151 L, 60 days)' },
        ]}
        value={filterConfig.type}
        disabled={!view.mayEdit}
        onChange={(type) => {
          act({ action: 'set_filter', installed: true, type }, 'Could not change the filter type');
        }}
      />
      <ValueRow
        icon="calendar"
        title="Fitted on"
        value={
          filterConfig.installedOn === null
            ? 'Not set'
            : shortDate(startOfDayKey(filterConfig.installedOn))
        }
      />
    </>
  );
}

function FilterRows({ view }: { readonly view: BottleSettingsView }): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  return (
    <>
      <Anchored deviceId={view.deviceId} id="filter" label="Filter pod">
        <SwitchRow
          icon="filter"
          title="I use a filter pod"
          subtitle="Counts its litres and days under Care"
          value={view.filterConfig.installed}
          disabled={!view.mayEdit}
          onChange={(installed) => {
            act(
              installed
                ? {
                    action: 'set_filter',
                    installed,
                    installedOn: new Date().toISOString().slice(0, 10),
                  }
                : { action: 'set_filter', installed },
              'Could not change the filter',
            );
          }}
        />
      </Anchored>
      <FilterTypeRows view={view} />
    </>
  );
}

export function BottleList({ view }: { readonly view: BottleSettingsView }): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  return (
    <List inset title="This bottle" {...(view.mayBind ? { footer: WHOSE_FOOTER } : {})}>
      <Whose view={view} />
      <Anchored deviceId={view.deviceId} id="body" label="Bottle size">
        <BodyPicker
          value={view.body}
          disabled={!view.mayEdit}
          onChange={(body) => {
            act({ action: 'set_body', body }, 'Could not change the bottle size');
          }}
        />
      </Anchored>
      <Anchored deviceId={view.deviceId} id="goal" label="Daily goal">
        <NavRow
          icon="trophy"
          title="Daily water goal"
          value={millilitres(Math.round(view.goalMl))}
          href={href.settings.focus('health/goals', 'fitness-goal-hydration_ml')}
        />
      </Anchored>
      <FilterRows view={view} />
    </List>
  );
}
