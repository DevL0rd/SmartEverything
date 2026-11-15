import {
  PLANNER_FEED_DEFAULT_REFRESH_MINUTES,
  type PlannerColourKey,
  type PlannerFeedCreate,
  type PlannerHolidayRegion,
} from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ColourSwatches } from '../../../components/colour-swatches';
import { SelectRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { usePlannerWrites } from '../data';
import { useHolidayRegions, useHomeCountry, usePlannerFeeds } from '../data/feeds';
import { usePlannerFrame } from '../frame/frame-context';
import { COLOUR_OPTIONS } from '../settings/options';
import { addressOf, defaultCountryOf, refreshOptionsOf, subscriptionNameOf } from './feeds-model';

export type AddKind = 'calendar' | 'subscribe' | 'holidays';

function useSaving(onClose: () => void): {
  readonly saving: boolean;
  readonly save: (work: () => Promise<unknown>, failure: string) => void;
} {
  const [saving, setSaving] = useState(false);
  return {
    saving,
    save: (work, failure): void => {
      setSaving(true);
      work()
        .then(onClose)
        .catch((error: unknown) => {
          notify({ message: failure, error, tone: 'critical' });
        })
        .finally(() => {
          setSaving(false);
        });
    },
  };
}

function NewCalendarBody({ onClose }: { readonly onClose: () => void }): ReactNode {
  const writes = usePlannerWrites(usePlannerFrame().person);
  const [name, setName] = useState('');
  const [colour, setColour] = useState<PlannerColourKey>('personal');
  const { saving, save } = useSaving(onClose);
  const ready = name.trim() !== '';
  const create = (): void => {
    if (!ready) return;
    save(
      () =>
        writes.createCollection({ kind: 'calendar', name: name.trim(), colour, icon: 'calendar' }),
      `${name.trim()} was not added`,
    );
  };
  return (
    <View className="gap-3 px-4 pb-3">
      <TextField label="Name" value={name} onChange={setName} onSubmit={create} focusOnMount />
      <ColourSwatches label="Colour" value={colour} options={COLOUR_OPTIONS} onChange={setColour} />
      <Button
        label="Add calendar"
        icon="plus"
        disabled={!ready}
        loading={saving}
        onPress={create}
      />
    </View>
  );
}

function SubscribeBody({ onClose }: { readonly onClose: () => void }): ReactNode {
  const feeds = usePlannerFeeds(usePlannerFrame().person);
  const [address, setAddress] = useState('');
  const [refresh, setRefresh] = useState(PLANNER_FEED_DEFAULT_REFRESH_MINUTES);
  const { saving, save } = useSaving(onClose);
  const check = addressOf(address);
  const subscribe = (): void => {
    if (!check.ok) return;
    const body: PlannerFeedCreate = {
      kind: 'ics',
      url: check.url,
      refresh_minutes: refresh,
      name: subscriptionNameOf(check.url),
    };
    save(() => feeds.add(body), 'The subscription was not added');
  };
  return (
    <View className="gap-3 px-4 pb-3">
      <TextField
        label="Calendar address"
        kind="url"
        value={address}
        onChange={setAddress}
        onSubmit={subscribe}
        placeholder="https://example.com/calendar.ics"
        error={check.ok ? null : check.reason}
        helper="The hub fetches it and keeps it up to date. Its events are read only."
        focusOnMount
      />
      <SelectRow
        title="Check for changes"
        icon="refresh"
        options={refreshOptionsOf(refresh)}
        value={String(refresh)}
        onChange={(value) => {
          setRefresh(Number(value));
        }}
      />
      <Button
        label="Subscribe"
        icon="globe"
        disabled={!check.ok}
        loading={saving}
        onPress={subscribe}
      />
    </View>
  );
}

const WHOLE_COUNTRY = 'whole';

interface RegionPickerProps {
  readonly regions: readonly PlannerHolidayRegion[];
  readonly country: string | null;
  readonly state: string;
  readonly onCountry: (country: string) => void;
  readonly onState: (state: string) => void;
}

function RegionPicker({
  regions,
  country,
  state,
  onCountry,
  onState,
}: RegionPickerProps): ReactNode {
  const region = regions.find((entry) => entry.country === country);
  return (
    <>
      <SelectRow
        title="Country"
        icon="globe"
        searchable
        options={regions.map((entry) => ({ value: entry.country, label: entry.name }))}
        value={country}
        onChange={onCountry}
      />
      {region === undefined || region.states.length === 0 ? null : (
        <SelectRow
          title="Region"
          icon="locate"
          searchable
          options={[
            { value: WHOLE_COUNTRY, label: `All of ${region.name}` },
            ...region.states.map((entry) => ({ value: entry.code, label: entry.name })),
          ]}
          value={state}
          onChange={onState}
        />
      )}
    </>
  );
}

function HolidaysBody({ onClose }: { readonly onClose: () => void }): ReactNode {
  const feeds = usePlannerFeeds(usePlannerFrame().person);
  const regions = useHolidayRegions(true).data ?? [];
  const home = useHomeCountry();
  const [picked, setPicked] = useState<string | null>(null);
  const [state, setState] = useState(WHOLE_COUNTRY);
  const { saving, save } = useSaving(onClose);
  const country = picked ?? defaultCountryOf(regions, home);
  const region = regions.find((entry) => entry.country === country);
  const add = (): void => {
    if (region === undefined) return;
    save(
      () =>
        feeds.add({
          kind: 'holidays',
          country: region.country,
          state: state === WHOLE_COUNTRY ? null : state,
        }),
      `Holidays in ${region.name} were not added`,
    );
  };
  return (
    <View className="gap-3 px-4 pb-3">
      <RegionPicker
        regions={regions}
        country={country}
        state={state}
        onCountry={(value) => {
          setPicked(value);
          setState(WHOLE_COUNTRY);
        }}
        onState={setState}
      />
      <Text variant="caption" tone="variant">
        Public holidays are worked out on the hub for every year you look at, no internet needed.
      </Text>
      <Button
        label="Add holidays"
        icon="sun"
        disabled={region === undefined}
        loading={saving}
        onPress={add}
      />
    </View>
  );
}

const TITLES: Readonly<Record<AddKind, string>> = {
  calendar: 'New calendar',
  subscribe: 'Subscribe by address',
  holidays: 'Public holidays',
};

export function AddCalendarSheet({
  kind,
  onClose,
}: {
  readonly kind: AddKind | null;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet
      open={kind !== null}
      onClose={onClose}
      title={kind === null ? '' : TITLES[kind]}
      detents={['fit']}
      subpage
    >
      {kind === 'calendar' ? <NewCalendarBody onClose={onClose} /> : null}
      {kind === 'subscribe' ? <SubscribeBody onClose={onClose} /> : null}
      {kind === 'holidays' ? <HolidaysBody onClose={onClose} /> : null}
    </Sheet>
  );
}
