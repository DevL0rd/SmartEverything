import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import type { View } from 'react-native';
import type { AppHref } from '../../../components/app-href';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { NavRow, SelectRow, SwitchRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { TimeField, localeUsesHour12 } from '../../../components/time-field';
import { MINUTES_IN_HOUR, clockTextOf, timeOfClockText, type Option } from './options';
import { useOwnPrefs, useSavePrefs, type Prefs, type PrefsChange } from './preferences';

export interface RowSpec {
  readonly title: string;
  readonly icon: IconName;
  readonly description?: string;
}

export interface SwitchSpec extends RowSpec {
  readonly get: (prefs: Prefs) => boolean;
  readonly set: (on: boolean, prefs: Prefs) => PrefsChange;
}

export interface ValueSpec extends RowSpec {
  readonly get: (prefs: Prefs) => string;
  readonly set: (value: string, prefs: Prefs) => PrefsChange;
}

export interface LinkSpec extends RowSpec {
  readonly href: AppHref;
  readonly value: (prefs: Prefs) => string;
}

interface RowBase {
  readonly title: string;
  readonly icon: IconName;
  readonly subtitle?: string;
  readonly wrapSubtitle?: boolean;
}

function baseOf(spec: RowSpec): RowBase {
  return {
    title: spec.title,
    icon: spec.icon,
    ...(spec.description === undefined ? {} : { subtitle: spec.description, wrapSubtitle: true }),
  };
}

function Waiting({ spec }: { readonly spec: RowSpec }): ReactNode {
  return <ListRow {...baseOf(spec)} disabled />;
}

export function PrefSwitchRow({ spec }: { readonly spec: SwitchSpec }): ReactNode {
  const prefs = useOwnPrefs();
  const save = useSavePrefs(spec.title);
  if (prefs === undefined) {
    return <Waiting spec={spec} />;
  }
  return (
    <SwitchRow
      {...baseOf(spec)}
      value={spec.get(prefs)}
      onChange={(on) => {
        save((current) => spec.set(on, current));
      }}
    />
  );
}

export function PrefSelectRow({
  spec,
  options,
}: {
  readonly spec: ValueSpec;
  readonly options: readonly Option[] | ((value: string) => readonly Option[]);
}): ReactNode {
  const prefs = useOwnPrefs();
  const save = useSavePrefs(spec.title);
  if (prefs === undefined) {
    return <Waiting spec={spec} />;
  }
  const value = spec.get(prefs);
  return (
    <SelectRow
      {...baseOf(spec)}
      options={typeof options === 'function' ? options(value) : options}
      value={value}
      onChange={(value) => {
        save((current) => spec.set(value, current));
      }}
    />
  );
}

export function PrefMinutesRow({
  spec,
}: {
  readonly spec: RowSpec & {
    readonly get: (prefs: Prefs) => number;
    readonly set: (minutes: number) => PrefsChange;
  };
}): ReactNode {
  const prefs = useOwnPrefs();
  const save = useSavePrefs(spec.title);
  if (prefs === undefined) {
    return <Waiting spec={spec} />;
  }
  return (
    <ListRow
      {...baseOf(spec)}
      trailing={
        <NumberStepper
          label={spec.title}
          value={spec.get(prefs)}
          min={1}
          max={MINUTES_IN_HOUR}
          step={1}
          unit="min"
          onChange={(minutes) => {
            save(() => spec.set(minutes));
          }}
        />
      }
    />
  );
}

export function PrefLinkRow({ spec }: { readonly spec: LinkSpec }): ReactNode {
  const prefs = useOwnPrefs();
  return (
    <NavRow
      {...baseOf(spec)}
      href={spec.href}
      {...(prefs === undefined ? {} : { value: spec.value(prefs) })}
    />
  );
}

function TimeSheet({
  title,
  initial,
  opener,
  onSave,
  onClose,
}: {
  readonly title: string;
  readonly initial: string;
  readonly opener: RefObject<View | null>;
  readonly onSave: (value: string) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [time, setTime] = useState(() => timeOfClockText(initial));
  return (
    <Sheet
      subpage={{ opener }}
      open
      onClose={onClose}
      title={title}
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button
            label="Save"
            onPress={() => {
              onClose();
              onSave(clockTextOf(time));
            }}
          />
        </>
      }
    >
      <TimeField label={title} value={time} onChange={setTime} hour12={localeUsesHour12()} />
    </Sheet>
  );
}

export function PrefTimeRow({ spec }: { readonly spec: ValueSpec }): ReactNode {
  const prefs = useOwnPrefs();
  const save = useSavePrefs(spec.title);
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  if (prefs === undefined) {
    return <Waiting spec={spec} />;
  }
  return (
    <>
      <ListRow
        {...baseOf(spec)}
        pressRef={opener}
        value={spec.get(prefs)}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <TimeSheet
          title={spec.title}
          initial={spec.get(prefs)}
          opener={opener}
          onClose={() => {
            setOpen(false);
          }}
          onSave={(value) => {
            save((current) => spec.set(value, current));
          }}
        />
      ) : null}
    </>
  );
}
