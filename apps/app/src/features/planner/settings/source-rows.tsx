import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { ColourSwatches } from '../../../components/colour-swatches';
import { ListRow } from '../../../components/list-row';
import { NavRow, SwitchRow } from '../../../components/rows';
import { notify } from '../../../components/toast-store';
import { rowsOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { useGoogleAccount, usePlannerCollections, usePlannerWrites } from '../data';
import type { CollectionChange } from '../data/writes';
import { COLOUR_OPTIONS, NONE, googleRowText, ringsOnClient, type Option } from './options';
import { PrefSelectRow, PrefSwitchRow, type ValueSpec } from './rows';

interface Named {
  readonly id: string;
  readonly name: string;
}

function optionsOf(rows: readonly Named[]): readonly Option[] {
  return rows.map((row) => ({ value: row.id, label: row.name }));
}

function useOwnProfileId(): string | null {
  return useStoreSelector((state) => state.session?.client.profile_id ?? null);
}

export function GoogleRow(): ReactNode {
  const view = useGoogleAccount();
  return (
    <NavRow
      title="Google"
      icon="link"
      href={href.settings.connections()}
      subtitle={googleRowText(view)}
      subtitleTone={view.needsAttention ? 'critical' : 'variant'}
    />
  );
}

export function CalendarRows(): ReactNode {
  const writes = usePlannerWrites(null);
  const calendars = usePlannerCollections(null).filter((row) => row.kind === 'calendar');
  if (calendars.length === 0) {
    return <ListRow icon="calendar" title="No calendars yet" />;
  }
  return calendars.map((row) => {
    const change = (edit: CollectionChange): void => {
      writes.updateCollection(row, edit).catch((error: unknown) => {
        notify({ message: `${row.name} was not changed`, error, tone: 'critical' });
      });
    };
    return (
      <View key={row.id}>
        <SwitchRow
          icon="calendar"
          title={row.name}
          value={row.visible}
          onChange={(visible) => {
            change({ visible });
          }}
        />
        <View className="px-4 pb-3">
          <ColourSwatches
            label={`${row.name} colour`}
            value={row.colour}
            options={COLOUR_OPTIONS}
            onChange={(colour) => {
              change({ colour });
            }}
          />
        </View>
      </View>
    );
  });
}

export function RingOnRows(): ReactNode {
  const me = useOwnProfileId();
  const clients = useStoreSelector((state) => rowsOf(state.tables.clients));
  const phones = clients.filter((row) => row.kind === 'phone' && row.profile_id === me);
  if (phones.length === 0) {
    return <ListRow icon="smartphone" title="No phones paired" />;
  }
  return phones.map((phone) => (
    <PrefSwitchRow
      key={phone.id}
      spec={{
        title: phone.name,
        icon: 'smartphone',
        get: (prefs) => prefs.clock.targets.some((target) => ringsOnClient(target, phone.id)),
        set: (on, prefs) => ({
          clock: {
            targets: [
              ...prefs.clock.targets.filter((target) => !ringsOnClient(target, phone.id)),
              ...(on ? [{ kind: 'client' as const, clientId: phone.id }] : []),
            ],
          },
        }),
      }}
    />
  ));
}

export function ShownPersonRow({ spec }: { readonly spec: ValueSpec }): ReactNode {
  const me = useOwnProfileId();
  const people = useStoreSelector((state) => rowsOf(state.tables.profiles));
  const others = optionsOf(people.filter((row) => row.id !== me));
  return <PrefSelectRow spec={spec} options={[{ value: NONE, label: 'You' }, ...others]} />;
}

export function DefaultListRow({ spec }: { readonly spec: ValueSpec }): ReactNode {
  const lists = usePlannerCollections(null).filter((row) => row.kind === 'list');
  return (
    <PrefSelectRow spec={spec} options={[{ value: NONE, label: 'Not set' }, ...optionsOf(lists)]} />
  );
}

export function WakeSceneRow({ spec }: { readonly spec: ValueSpec }): ReactNode {
  const scenes = useStoreSelector((state) => rowsOf(state.tables.scenes));
  return (
    <PrefSelectRow spec={spec} options={[{ value: NONE, label: 'None' }, ...optionsOf(scenes)]} />
  );
}
