import type { PlannerColourKey } from '@smarteverything/domain';
import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { ColourSwatches } from '../../../components/colour-swatches';
import { rowsOf as childRowsOf } from '../../../components/list-rows';
import { NavRow, SwitchRow } from '../../../components/rows';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { rowsOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { mayChangeLook } from '../calendar/calendar-edit';
import { sourceText } from '../calendar/calendars-model';
import { useGoogleAccount, usePlannerCollections } from '../data';
import { usePlannerSharing, useViewerCalendars, type ViewerLook } from '../data/sharing';
import { useClockFormat } from '../../../store/clock-format';
import { weekOrderOf } from '../clock/alarm-text';
import {
  COLOUR_OPTIONS,
  DAY_NAMES,
  NONE,
  googleRowText,
  ringsOnClient,
  type Option,
} from './options';
import { useOwnPrefs } from './preferences';
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
  const format = useClockFormat();
  return (
    <NavRow
      title="Google"
      icon="link"
      href={href.settings.page('connections/google')}
      subtitle={googleRowText(view, format)}
      subtitleTone={view.needsAttention ? 'critical' : 'variant'}
    />
  );
}

function leadingInsetOf(leading: boolean, pointer: boolean): string {
  if (!leading) return 'ml-4';
  return pointer ? 'ml-16' : 'ml-18';
}

function DividedRows({
  children,
  leading,
}: {
  readonly children: ReactNode;
  readonly leading: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View>
      {childRowsOf(children).map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index === 0 ? null : (
            <View
              className={cn('h-hairline bg-outline-variant', leadingInsetOf(leading, pointer))}
            />
          )}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

function ColourLead({ colour }: { readonly colour: PlannerColourKey }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const swatch = COLOUR_OPTIONS.find((option) => option.value === colour)?.swatchClassName;
  return (
    <View
      className={cn(
        'items-center justify-center bg-surface-3',
        pointer ? 'size-8 rounded-sm' : 'size-10 rounded-full',
      )}
    >
      <View className={cn('size-4 rounded-full', swatch)} />
    </View>
  );
}

export function CalendarRows(): ReactNode {
  const sharing = usePlannerSharing(null);
  const pointer = useIdiom() === 'pointer';
  const calendars = useViewerCalendars(null).filter(mayChangeLook);
  if (calendars.length === 0) {
    return (
      <NavRow
        icon="calendar"
        title="No calendars yet"
        subtitle="Add one from the Calendar page."
        href={href.planner.calendar()}
      />
    );
  }
  const rows = calendars.map((calendar) => {
    const { row } = calendar;
    const change = (look: ViewerLook): void => {
      sharing.look(calendar, look).catch((error: unknown) => {
        notify({ message: `${row.name} was not changed`, error, tone: 'critical' });
      });
    };
    return (
      <View key={row.id}>
        <SwitchRow
          leading={<ColourLead colour={row.colour} />}
          title={row.name}
          subtitle={sourceText(calendar)}
          value={row.visible}
          onChange={(visible) => {
            change({ visible });
          }}
        />
        <View className={cn('pb-2 pr-4', pointer ? 'pl-16' : 'pl-18')}>
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
  return <DividedRows leading>{rows}</DividedRows>;
}

function weekDaysOf(weekStart: number): readonly { readonly name: string; readonly day: number }[] {
  const order = weekOrderOf(weekStart);
  return DAY_NAMES.map((name, day) => ({ name, day })).sort(
    (left, right) => order.indexOf(left.day) - order.indexOf(right.day),
  );
}

export function WorkDayRows(): ReactNode {
  const prefs = useOwnPrefs();
  if (prefs === undefined) return null;
  return (
    <DividedRows leading={false}>
      {weekDaysOf(prefs.general.week_start).map(({ name, day }) => (
        <PrefSwitchRow
          key={day}
          spec={{
            title: name,
            get: (current) => current.general.working_hours.days.includes(day),
            set: (on, current) => {
              const hours = current.general.working_hours;
              const days = Array.from(DAY_NAMES.keys()).filter((entry) =>
                entry === day ? on : hours.days.includes(entry),
              );
              return { general: { working_hours: { ...hours, days } } };
            },
          }}
        />
      ))}
    </DividedRows>
  );
}

export function RingOnRows(): ReactNode {
  const me = useOwnProfileId();
  const clients = useStoreSelector((state) => rowsOf(state.tables.clients));
  const phones = clients.filter((row) => row.kind === 'phone' && row.profile_id === me);
  if (phones.length === 0) {
    return (
      <NavRow
        icon="smartphone"
        title="No phones paired"
        subtitle="Pair a phone to ring alarms on it"
        href={href.settings.page('members')}
      />
    );
  }
  const rows = phones.map((phone) => (
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
  return <DividedRows leading>{rows}</DividedRows>;
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

export function WakeAutomationRow({ spec }: { readonly spec: ValueSpec }): ReactNode {
  const automations = useStoreSelector((state) => rowsOf(state.tables.automations));
  return (
    <PrefSelectRow
      spec={spec}
      options={[{ value: NONE, label: 'None' }, ...optionsOf(automations)]}
    />
  );
}
