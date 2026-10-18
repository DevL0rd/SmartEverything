import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  SIGNAL_SOURCES,
  kindSpecOf,
  type AiChatRow,
  type ProfileRow,
  type SignalKindSpec,
  type SignalSubject,
  type SignalTriggerV2,
} from '@smarteverything/domain';
import { Select, type SelectOption } from '../../../components/select';
import { useProfiles } from '../../../store/people';
import { useRows } from '../../../store/selectors';
import type { Catalog } from '../data/use-automations';
import type { DeviceLike, TestOperator } from '../model/capability-choices';
import { signalFieldOf } from '../model/signal-text';
import {
  genericSources,
  signalOf,
  timingOf,
  windowModesFor,
  withTiming,
} from '../model/signal-triggers';
import { SignalMatchFields } from './signal-match-fields';
import { deviceOptions } from './target-fields';
import { TestFields } from './test-fields';
import { TimingSection } from './timing-section';

const ANY = 'any';
const AMOUNT_OPERATORS: readonly TestOperator[] = ['changed', 'gt', 'gte', 'lt', 'lte', 'between'];

interface SignalProps {
  readonly catalog: Catalog;
  readonly trigger: SignalTriggerV2;
  readonly onChange: (trigger: SignalTriggerV2) => void;
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
  automation_value: null,
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

function withoutKey(
  trigger: SignalTriggerV2,
  key: 'field' | 'subject',
  value: string,
): SignalTriggerV2 {
  const { [key]: _removed, ...rest } = trigger;
  return value === ANY ? rest : { ...rest, [key]: value };
}

function FieldPicker({ trigger, onChange }: Omit<SignalProps, 'catalog'>): ReactNode {
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
        onChange(withoutKey(trigger, 'field', field));
      }}
    />
  );
}

function SignalPickers({ catalog, trigger, onChange }: SignalProps): ReactNode {
  const source = SIGNAL_SOURCES.find((spec) => spec.source === trigger.source);
  const spec = kindSpecOf(SIGNAL_SOURCES, trigger);
  const subject = useSubjectChoice(spec, catalog.devices);
  return (
    <View className="gap-3">
      <Select
        label="From"
        value={trigger.source}
        options={sourceOptions(trigger.source)}
        onChange={(next) => {
          const first = SIGNAL_SOURCES.find((entry) => entry.source === next)?.kinds[0];
          if (first !== undefined) {
            onChange(signalOf(next, first, trigger));
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
            onChange(signalOf(trigger.source, kind, trigger));
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
            onChange(withoutKey(trigger, 'subject', id));
          }}
        />
      )}
    </View>
  );
}

export function GenericSignalFields(props: SignalProps): ReactNode {
  const { catalog, trigger, onChange } = props;
  const pulse = kindSpecOf(SIGNAL_SOURCES, trigger)?.pulse === true;
  const unit = signalFieldOf(trigger)?.unit ?? null;
  return (
    <View className="gap-3">
      <SignalPickers {...props} />
      <SignalMatchFields
        source={trigger.source}
        kind={trigger.kind}
        match={trigger.match}
        onChange={(match) => {
          const { match: _old, ...rest } = trigger;
          onChange(match === undefined ? rest : { ...rest, match });
        }}
      />
      {pulse || trigger.test === undefined ? null : (
        <TestFields
          catalog={catalog}
          shape={{ type: 'kind', kind: 'number', unit }}
          test={trigger.test}
          operators={AMOUNT_OPERATORS}
          onChange={(test) => {
            onChange({ ...trigger, test });
          }}
        />
      )}
      <TimingSection
        timing={timingOf(trigger)}
        modes={windowModesFor('generic', null).filter((mode) => !pulse || mode === 'count')}
        pulse={pulse}
        onChange={(next) => {
          onChange(withTiming(trigger, next));
        }}
      />
    </View>
  );
}
