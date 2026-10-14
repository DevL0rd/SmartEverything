import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  SIGNAL_SOURCES,
  kindSpecOf,
  type AiChatRow,
  type ProfileRow,
  type SignalKindSpec,
  type SignalSubject,
  type SignalTrigger,
  type Trigger,
} from '@smarteverything/domain';
import { Select, type SelectOption } from '../../../components/select';
import { useProfiles } from '../../../store/people';
import { useRows } from '../../../store/selectors';
import type { DeviceLike } from '../model/capability-choices';
import { signalFieldOf } from '../model/signal-text';
import { countComparison, genericSources, timingOf, withKind } from '../model/signal-triggers';
import { SignalMatchFields } from './signal-match-fields';
import { SignalAmountFields } from './signal-amount-fields';
import { deviceOptions } from './target-fields';
import { TimingSection } from './timing-section';

const ANY = 'any';

interface SignalProps {
  readonly trigger: SignalTrigger;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (trigger: Trigger) => void;
}

function sourceOptions(current: string): SelectOption<string>[] {
  return SIGNAL_SOURCES.filter(
    (spec) => spec.source === current || genericSources().includes(spec),
  ).map((spec) => ({ value: spec.source, label: spec.label }));
}

interface SubjectChoice {
  readonly label: string;
  readonly options: SelectOption<string>[];
}

interface SubjectSources {
  readonly devices: readonly DeviceLike[];
  readonly people: readonly ProfileRow[];
  readonly chats: readonly AiChatRow[];
}

type SubjectChooser = (sources: SubjectSources) => SubjectChoice;

const deviceChoice: SubjectChooser = ({ devices }) => ({
  label: 'From device',
  options: [{ value: ANY, label: 'Any device' }, ...deviceOptions(devices)],
});

const SUBJECT_CHOICES: Readonly<Record<SignalSubject, SubjectChooser | null>> = {
  device: deviceChoice,
  camera: deviceChoice,
  profile: ({ people }) => ({
    label: 'Whose',
    options: [
      { value: ANY, label: 'Anyone' },
      ...people.map((person) => ({ value: person.id, label: person.name })),
    ],
  }),
  chat: ({ chats }) => ({
    label: 'In which chat',
    options: [
      { value: ANY, label: 'Any chat' },
      ...chats
        .filter((chat) => chat.archived_at === null)
        .map((chat) => ({ value: chat.id, label: chat.title })),
    ],
  }),
  client: null,
  channel: null,
  automation: null,
  schedule: null,
  planner_item: null,
  none: null,
};

function useSubjectChoice(
  spec: SignalKindSpec | undefined,
  devices: readonly DeviceLike[],
): SubjectChoice | null {
  const people = useProfiles();
  const chats = useRows('ai_chats');
  const choose = spec === undefined ? null : SUBJECT_CHOICES[spec.subject];
  return choose === null ? null : choose({ devices, people, chats });
}

function FieldPicker({ trigger, onChange }: Omit<SignalProps, 'devices'>): ReactNode {
  const spec = kindSpecOf(SIGNAL_SOURCES, trigger);
  if (spec === undefined || spec.fields === 'capabilities' || spec.fields.length === 0) {
    return null;
  }
  const options = spec.fields.map((field) => ({ value: field.field, label: field.label }));
  return (
    <Select
      label="Which"
      value={trigger.field ?? ANY}
      options={spec.pulse ? [{ value: ANY, label: 'Anything' }, ...options] : options}
      searchable
      onChange={(field) => {
        onChange({ ...trigger, field: field === ANY ? null : field });
      }}
    />
  );
}

function SignalPickers({ trigger, devices, onChange }: SignalProps): ReactNode {
  const source = SIGNAL_SOURCES.find((spec) => spec.source === trigger.source);
  const spec = kindSpecOf(SIGNAL_SOURCES, trigger);
  const subject = useSubjectChoice(spec, devices);
  return (
    <View className="gap-3">
      <Select
        label="From"
        value={trigger.source}
        options={sourceOptions(trigger.source)}
        onChange={(next) => {
          const first = SIGNAL_SOURCES.find((entry) => entry.source === next)?.kinds[0];
          if (first !== undefined) {
            onChange(withKind(trigger, next, first));
          }
        }}
      />
      <Select
        label="What"
        value={trigger.kind}
        options={(source?.kinds ?? []).map((entry) => ({ value: entry.kind, label: entry.label }))}
        searchable
        onChange={(next) => {
          const kind = source?.kinds.find((entry) => entry.kind === next);
          if (kind !== undefined) {
            onChange(withKind(trigger, trigger.source, kind));
          }
        }}
      />
      <FieldPicker trigger={trigger} onChange={onChange} />
      {subject === null ? null : (
        <Select
          label={subject.label}
          value={trigger.subject ?? ANY}
          options={subject.options}
          searchable
          onChange={(id) => {
            onChange({ ...trigger, subject: id === ANY ? null : id });
          }}
        />
      )}
    </View>
  );
}

export function GenericSignalFields(props: SignalProps): ReactNode {
  const { trigger, onChange } = props;
  const pulse = kindSpecOf(SIGNAL_SOURCES, trigger)?.pulse === true;
  return (
    <View className="gap-3">
      <SignalPickers {...props} />
      <SignalMatchFields
        {...trigger}
        onChange={(match) => {
          onChange({ ...trigger, match });
        }}
      />
      {pulse || trigger.comparison === null ? null : (
        <SignalAmountFields
          comparison={trigger.comparison}
          unit={signalFieldOf(trigger)?.unit ?? null}
          onChange={(comparison) => {
            onChange({ ...trigger, comparison });
          }}
        />
      )}
      <TimingSection
        timing={timingOf(trigger)}
        modes={pulse ? ['count'] : ['avg', 'min', 'max', 'rate']}
        pulse={pulse}
        onChange={(next) => {
          onChange({
            ...trigger,
            ...(pulse ? { comparison: countComparison(next) } : {}),
            window: next.window,
            holdSeconds: next.holdSeconds,
            debounceSeconds: next.debounceSeconds,
            cooldownSeconds: next.cooldownSeconds,
          });
        }}
      />
    </View>
  );
}
