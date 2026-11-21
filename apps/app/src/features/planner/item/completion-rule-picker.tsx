import type {
  PlannerCompletion,
  PlannerCompletionWindow,
  PlannerItemRow,
  PlannerSignalCompletion,
} from '@smarteverything/domain';
import { keepPreviousData } from '@tanstack/react-query';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import type { PlannerSuggestion } from '../../../api/planner';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useIsPhone } from '../../../design/size-class';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { usePlannerTools, type PlannerPerson } from '../data';
import {
  CompletionRuleRow,
  MANUAL,
  WINDOW_TEXT,
  ruleDetailOf,
  ruleMinutesOf,
  sameRule,
  sentenceOf,
  subjectOf,
  useRuleDevice,
  whoseTextOf,
  withMinutes,
  withWindow,
  type RuleDevice,
} from './completion-rule-row';
import type { ItemChanges } from './repeat-scope-bar';
import { useDeviceChooser, useRuleDevices, type RuleDevices } from './rule-devices';

export interface RuleChoice {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  readonly completion: PlannerCompletion;
}

export interface RuleChoices {
  readonly suggested: RuleChoice | null;
  readonly others: readonly RuleChoice[];
}

const MANUAL_CHOICE: RuleChoice = {
  key: 'manual',
  title: 'I tick it myself',
  subtitle: 'Manual',
  completion: MANUAL,
};

const ANY = 'any';

function capitalised(text: string): string {
  return `${text.charAt(0).toLocaleUpperCase()}${text.slice(1)}`;
}

const WINDOW_OPTIONS: readonly SegmentedOption<PlannerCompletionWindow>[] = [
  { value: 'occurrence', label: capitalised(WINDOW_TEXT.occurrence) },
  { value: 'day', label: capitalised(WINDOW_TEXT.day) },
];

export interface ChoiceContext {
  readonly devices: RuleDevices;
  readonly personName: string;
}

function choiceFor(key: string, completion: PlannerCompletion, context: ChoiceContext): RuleChoice {
  if (completion.kind === 'manual') return { ...MANUAL_CHOICE, key };
  const device = context.devices.get(subjectOf(completion) ?? '') ?? null;
  return {
    key,
    title: capitalised(sentenceOf(completion, device)),
    subtitle: ruleDetailOf(completion, device, context.personName),
    completion,
  };
}

export function ruleChoicesOf(
  current: PlannerCompletion,
  suggestions: readonly PlannerSuggestion[],
  context: ChoiceContext,
): RuleChoices {
  const listed = suggestions.map((suggestion, index) =>
    choiceFor(
      `rule:${String(index)}`,
      sameRule(suggestion.completion, current) ? current : suggestion.completion,
      context,
    ),
  );
  const [first, ...rest] = listed;
  const kept =
    current.kind === 'signal' && !listed.some((choice) => sameRule(choice.completion, current))
      ? [choiceFor('current', current, context)]
      : [];
  return { suggested: first ?? null, others: [MANUAL_CHOICE, ...kept, ...rest] };
}

export function minuteOptionsOf(
  device: RuleDevice | null,
  completion: PlannerSignalCompletion,
): readonly SegmentedOption<string>[] {
  const presets = ruleMinutesOf(device);
  if (presets.length === 0) return [];
  const stored = completion.minSeconds === undefined ? null : completion.minSeconds / 60;
  const minutes = stored === null || presets.includes(stored) ? presets : [...presets, stored];
  return [
    ...[...minutes]
      .sort((a, b) => a - b)
      .map((value) => ({ value: String(value), label: `${String(value)} min` })),
    { value: ANY, label: 'Any' },
  ];
}

function minuteValueOf(completion: PlannerSignalCompletion): string {
  return completion.minSeconds === undefined ? ANY : String(completion.minSeconds / 60);
}

function useSuggestions(person: PlannerPerson, item: PlannerItemRow): readonly PlannerSuggestion[] {
  const tools = usePlannerTools(person);
  const query = useScreenQuery({
    queryKey: ['planner', 'suggest-completion', person, item.title, item.notes, item.attachments],
    queryFn: ({ signal }) =>
      tools.suggestCompletion(
        { title: item.title, notes: item.notes, attachments: [...item.attachments] },
        signal,
      ),
    placeholderData: keepPreviousData,
    retry: false,
  });
  return query.data ?? [];
}

interface TuningProps {
  readonly completion: PlannerSignalCompletion;
  readonly device: RuleDevice | null;
  readonly personName: string;
  readonly disabled: boolean;
  readonly onChange: (completion: PlannerCompletion) => void;
}

const SHORT_LABEL = 12;

interface ChoiceSettingProps<T extends string> {
  readonly title: string;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly disabled: boolean;
  readonly onChange: (value: T) => void;
}

function StackedChoice<T extends string>({
  title,
  options,
  value,
  disabled,
  onChange,
}: ChoiceSettingProps<T>): ReactNode {
  return (
    <View className="pt-3">
      <Text variant="body" className="px-4">
        {title}
      </Text>
      {options.map((option) => (
        <ListRow
          key={option.value}
          wrapTitle
          title={option.label}
          role="checkbox"
          checked={option.value === value}
          selected={option.value === value}
          disabled={disabled}
          trailing={option.value === value ? <Icon name="check" size={20} tone="primary" /> : null}
          onPress={() => {
            onChange(option.value);
          }}
        />
      ))}
    </View>
  );
}

function ChoiceSetting<T extends string>({
  title,
  options,
  value,
  disabled,
  onChange,
}: ChoiceSettingProps<T>): ReactNode {
  const stacked = useIsPhone();
  if (stacked && options.some((option) => option.label.length > SHORT_LABEL)) {
    return (
      <StackedChoice
        title={title}
        options={options}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }
  const control = (
    <Segmented
      options={options}
      value={value}
      onChange={onChange}
      label={title}
      disabled={disabled}
      compact={!stacked}
      fill={stacked}
    />
  );
  if (!stacked) return <ListRow title={title} trailing={control} />;
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="body">{title}</Text>
      {control}
    </View>
  );
}

function RuleTuning({
  completion,
  device,
  personName,
  disabled,
  onChange,
}: TuningProps): ReactNode {
  const minutes = minuteOptionsOf(device, completion);
  const whose = whoseTextOf(completion, device, personName);
  return (
    <List title="How it counts">
      {minutes.length === 0 ? null : (
        <ChoiceSetting
          title="At least"
          options={minutes}
          value={minuteValueOf(completion)}
          disabled={disabled}
          onChange={(value) => {
            onChange(withMinutes(completion, value === ANY ? null : Number(value)));
          }}
        />
      )}
      <ChoiceSetting
        title="Counts"
        options={WINDOW_OPTIONS}
        value={completion.window}
        disabled={disabled}
        onChange={(window) => {
          onChange(withWindow(completion, window));
        }}
      />
      {whose === null ? null : <ListRow wrapTitle title="Whose session" value={whose} />}
    </List>
  );
}

interface ChoiceRowProps {
  readonly choice: RuleChoice;
  readonly current: PlannerCompletion;
  readonly disabled: boolean;
  readonly onChoose: (choice: RuleChoice) => void;
}

function ChoiceRow({ choice, current, disabled, onChoose }: ChoiceRowProps): ReactNode {
  const chosen = sameRule(choice.completion, current);
  return (
    <ListRow
      wrapTitle
      wrapSubtitle
      title={choice.title}
      subtitle={choice.subtitle}
      icon={choice.completion.kind === 'signal' ? 'zap' : 'circleCheck'}
      iconTone={chosen ? 'primary' : 'variant'}
      selected={chosen}
      role="checkbox"
      checked={chosen}
      disabled={disabled}
      trailing={chosen ? <Icon name="check" size={20} tone="primary" /> : null}
      onPress={() => {
        onChoose(choice);
      }}
    />
  );
}

export interface CompletionRulePickerProps {
  readonly opener: RefObject<View | null>;
  readonly item: PlannerItemRow;
  readonly person: PlannerPerson;
  readonly personName: string;
  readonly device: RuleDevice | null;
  readonly disabled: boolean;
  readonly onChange: (completion: PlannerCompletion) => void;
  readonly onClose: () => void;
}

function PickerBody(props: CompletionRulePickerProps): ReactNode {
  const { item, device, disabled } = props;
  const current = item.completion;
  const devices = useRuleDevices();
  const chooser = useDeviceChooser({ devices, current, disabled, onChange: props.onChange });
  const suggestions = useSuggestions(props.person, item);
  const choices = ruleChoicesOf(current, suggestions, {
    devices,
    personName: props.personName,
  });
  const choose = (choice: RuleChoice): void => {
    if (!sameRule(choice.completion, current)) props.onChange(choice.completion);
  };
  const rows = (list: readonly RuleChoice[]): ReactNode =>
    list.map((choice) => (
      <ChoiceRow
        key={choice.key}
        choice={choice}
        current={current}
        disabled={disabled}
        onChoose={choose}
      />
    ));
  return (
    <>
      {choices.suggested === null ? (
        <Text variant="footnote" tone="variant" className="px-4">
          {`No device rule fits “${item.title}” yet.`}
        </Text>
      ) : (
        <List title={`Suggested for “${item.title}”`}>{rows([choices.suggested])}</List>
      )}
      {current.kind === 'signal' ? (
        <RuleTuning
          completion={current}
          device={device}
          personName={props.personName}
          disabled={disabled}
          onChange={props.onChange}
        />
      ) : null}
      <List title="Other rules">
        {rows(choices.others)}
        {chooser}
      </List>
    </>
  );
}

export function CompletionRulePicker(props: CompletionRulePickerProps): ReactNode {
  return (
    <Sheet
      subpage={{ opener: props.opener }}
      open
      onClose={props.onClose}
      title="Done when"
      detents={['fit']}
    >
      <PickerBody {...props} />
    </Sheet>
  );
}

export interface CompletionRuleFieldProps {
  readonly item: PlannerItemRow;
  readonly person: PlannerPerson;
  readonly personName: string;
  readonly disabled: boolean;
  readonly onChange: (changes: ItemChanges) => void;
}

export function CompletionRuleField({
  item,
  person,
  personName,
  disabled,
  onChange,
}: CompletionRuleFieldProps): ReactNode {
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const device = useRuleDevice(item.completion);
  return (
    <>
      <CompletionRuleRow
        completion={item.completion}
        device={device}
        personName={personName}
        disabled={disabled}
        pressRef={opener}
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <CompletionRulePicker
          opener={opener}
          item={item}
          person={person}
          personName={personName}
          device={device}
          disabled={disabled}
          onChange={(completion) => {
            onChange({ completion });
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function TaskRuleCard(props: CompletionRuleFieldProps): ReactNode {
  if (props.item.kind !== 'task') return null;
  return (
    <List>
      <CompletionRuleField {...props} />
    </List>
  );
}
