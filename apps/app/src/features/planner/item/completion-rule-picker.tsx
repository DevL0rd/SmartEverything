import type {
  PlannerCompletion,
  PlannerCompletionWindow,
  PlannerItemRow,
  PlannerSignalCompletion,
} from '@smarteverything/domain';
import { keepPreviousData } from '@tanstack/react-query';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';
import type { PlannerSuggestion } from '../../../api/planner';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { usePlannerTools, type PlannerPerson } from '../data';
import {
  CompletionRuleRow,
  MANUAL,
  WINDOW_TEXT,
  ruleMinutesOf,
  ruleTitleOf,
  sameRule,
  useRuleDevice,
  whoseTextOf,
  withMinutes,
  withWindow,
  type RuleDevice,
} from './completion-rule-row';
import type { ItemChanges } from './repeat-scope-bar';

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

const WINDOW_OPTIONS: readonly SegmentedOption<PlannerCompletionWindow>[] = [
  { value: 'occurrence', label: 'This slot or later' },
  { value: 'day', label: 'Any time that day' },
];

function capitalised(text: string): string {
  return `${text.charAt(0).toLocaleUpperCase()}${text.slice(1)}`;
}

function countsText(completion: PlannerCompletion): string {
  return completion.kind === 'signal' ? `Counts ${WINDOW_TEXT[completion.window]}` : 'Manual';
}

function choiceOf(suggestion: PlannerSuggestion, index: number): RuleChoice {
  return {
    key: `rule:${String(index)}`,
    title: capitalised(suggestion.label),
    subtitle: countsText(suggestion.completion),
    completion: suggestion.completion,
  };
}

export function ruleChoicesOf(
  current: PlannerCompletion,
  suggestions: readonly PlannerSuggestion[],
  currentTitle: string,
): RuleChoices {
  const listed = suggestions
    .map(choiceOf)
    .map((choice) =>
      sameRule(choice.completion, current)
        ? { ...choice, subtitle: countsText(current), completion: current }
        : choice,
    );
  const [first, ...rest] = listed;
  const kept =
    current.kind === 'signal' && !listed.some((choice) => sameRule(choice.completion, current))
      ? [
          {
            key: 'current',
            title: currentTitle,
            subtitle: countsText(current),
            completion: current,
          },
        ]
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
    queryFn: () =>
      tools.suggestCompletion({
        title: item.title,
        notes: item.notes,
        attachments: [...item.attachments],
      }),
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
        <ListRow
          title="At least"
          trailing={
            <Segmented
              options={minutes}
              value={minuteValueOf(completion)}
              onChange={(value) => {
                onChange(withMinutes(completion, value === ANY ? null : Number(value)));
              }}
              label="At least"
              disabled={disabled}
              compact
            />
          }
        />
      )}
      <ListRow
        title="Counts"
        trailing={
          <Segmented
            options={WINDOW_OPTIONS}
            value={completion.window}
            onChange={(window) => {
              onChange(withWindow(completion, window));
            }}
            label="Counts"
            disabled={disabled}
            compact
          />
        }
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
      title={choice.title}
      subtitle={choice.subtitle}
      icon={choice.completion.kind === 'signal' ? 'zap' : 'check'}
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
  const choices = ruleChoicesOf(
    current,
    useSuggestions(props.person, item),
    ruleTitleOf(current, device),
  );
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
      <List title="Other rules">{rows(choices.others)}</List>
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
