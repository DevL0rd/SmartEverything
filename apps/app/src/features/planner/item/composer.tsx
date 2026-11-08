import type { PlannerCollectionRow, PlannerColourKey } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { View, type TextInput } from 'react-native';
import type { PlannerSuggestion } from '../../../api/planner';
import { Button } from '../../../components/button';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import {
  usePlannerClockWrites,
  usePlannerCollections,
  usePlannerWrites,
  type ClockWrites,
  type PlannerPerson,
  type PlannerWrites,
} from '../data';
import type { QuickAddTarget } from '../frame/quick-add-bar';
import { TokenField, composerTokens, type ComposerToken } from './composer-tokens';
import {
  COMPOSER_KINDS,
  RuleCard,
  WillAdd,
  composerPlanOf,
  nextLineOf,
  readingOf,
  useParsePreview,
  willAddOf,
  type ComposerKind,
  type ComposerPlan,
  type WillAddChip,
} from './parse-preview';

export interface ComposerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly target: QuickAddTarget;
  readonly person: PlannerPerson;
  readonly text: string;
  readonly kind: ComposerKind | null;
  readonly disabled: boolean;
}

const KIND_OPTIONS: Readonly<Record<ComposerKind, SegmentedOption<ComposerKind>>> = {
  task: { value: 'task', label: 'Task' },
  event: { value: 'event', label: 'Event' },
  alarm: { value: 'alarm', label: 'Alarm' },
  timer: { value: 'timer', label: 'Timer' },
};

const ADD_LABEL: Readonly<Record<ComposerKind, string>> = {
  task: 'Add task',
  event: 'Add event',
  alarm: 'Add alarm',
  timer: 'Start timer',
};

const PLACEHOLDER: Readonly<Record<ComposerKind, string>> = {
  task: 'Try: brush teeth every day 07:30 and 22:00 #health !2',
  event: 'Try: dentist Saturday 15:30 to 16:15',
  alarm: 'Try: wake me 06:30 weekdays',
  timer: 'Try: pasta 10 min',
};

const TITLE: Readonly<Record<QuickAddTarget, string>> = {
  planner: 'Add to the Planner',
  clock: 'Add an alarm or timer',
};

const FAILED: Readonly<Record<QuickAddTarget, string>> = {
  planner: 'Couldn’t add that to the Planner',
  clock: 'Couldn’t add that to the Clock',
};

const OFFLINE = 'Changes wait for the hub';

const PARTNER: Readonly<Record<ComposerKind, ComposerKind>> = {
  task: 'event',
  event: 'task',
  alarm: 'timer',
  timer: 'alarm',
};

export interface ComposerPorts {
  readonly items: Pick<PlannerWrites, 'createItem' | 'createAlarm'>;
  readonly clock: Pick<ClockWrites, 'startTimer'>;
}

export async function addPlan(
  plan: ComposerPlan,
  rule: PlannerSuggestion | null,
  ports: ComposerPorts,
): Promise<void> {
  if (plan.kind === 'missing') return;
  if (plan.kind === 'timer') {
    await ports.clock.startTimer({ duration_ms: plan.body.ms, label: plan.body.label });
    return;
  }
  if (plan.kind === 'alarms') {
    await Promise.all(
      plan.bodies.map((body) => ports.items.createAlarm({ ...body, days: [...body.days] })),
    );
    return;
  }
  const completion = rule === null ? plan.body.completion : rule.completion;
  await ports.items.createItem({ ...plan.body, completion });
}

export function shownKindOf(
  target: QuickAddTarget,
  chosen: ComposerKind | null,
  parsed: ComposerKind | null,
): ComposerKind {
  const kinds = COMPOSER_KINDS[target];
  if (chosen !== null && kinds.includes(chosen)) return chosen;
  if (parsed !== null && kinds.includes(parsed)) return parsed;
  return kinds[0] ?? 'task';
}

function KeyHint({ keys, label }: { readonly keys: string; readonly label: string }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${keys}, ${label}`}
      className="flex-row items-center gap-1"
    >
      <View className="rounded-xs border border-outline px-1.5 py-0.5">
        <Text variant="caption" tone="variant">
          {keys}
        </Text>
      </View>
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

function KeyHints({ kind }: { readonly kind: ComposerKind }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <KeyHint keys="Enter" label={ADD_LABEL[kind].toLowerCase()} />
      <KeyHint keys="Tab" label={`switch to ${PARTNER[kind]}`} />
      <KeyHint keys="Esc" label="close" />
    </View>
  );
}

function StatusLine({
  text,
  problem,
}: {
  readonly text: string | null;
  readonly problem: boolean;
}): ReactNode {
  if (text === null) return null;
  return (
    <Text
      variant="footnote"
      tone={problem ? 'warning' : 'variant'}
      accessibilityLiveRegion="polite"
      className="tabular"
    >
      {text}
    </Text>
  );
}

interface ComposerState {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly kind: ComposerKind;
  readonly choose: (kind: ComposerKind) => void;
  readonly tokens: readonly ComposerToken[];
  readonly colour: PlannerColourKey | null;
  readonly chips: readonly WillAddChip[];
  readonly status: { readonly text: string | null; readonly problem: boolean };
  readonly suggestion: PlannerSuggestion | null;
  readonly ruleOn: boolean;
  readonly setRuleOn: (on: boolean) => void;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly submit: () => void;
}

function colourOf(
  collections: readonly PlannerCollectionRow[],
  collectionId: string | null,
): PlannerColourKey | null {
  return collections.find((row) => row.id === collectionId)?.colour ?? null;
}

function statusOf(
  plan: ComposerPlan | null,
  problem: string | null,
  next: string | null,
): ComposerState['status'] {
  if (problem !== null) return { text: problem, problem: true };
  if (plan?.kind === 'missing') return { text: plan.reason, problem: true };
  return { text: next, problem: false };
}

interface Submission {
  readonly plan: ComposerPlan | null;
  readonly current: boolean;
  readonly rule: PlannerSuggestion | null;
}

function useSubmit(
  props: ComposerProps,
  { plan, current, rule }: Submission,
): { readonly ready: boolean; readonly busy: boolean; readonly submit: () => void } {
  const items = usePlannerWrites(props.person);
  const clock = usePlannerClockWrites(props.person);
  const [busy, setBusy] = useState(false);
  const ready = plan !== null && plan.kind !== 'missing' && (current || plan.kind === 'timer');
  const submit = (): void => {
    if (plan === null || !ready || props.disabled || busy) return;
    setBusy(true);
    background(
      addPlan(plan, rule, { items, clock })
        .then(props.onClose)
        .catch((error: unknown) => {
          notify({ message: FAILED[props.target], error, tone: 'critical' });
        })
        .finally(() => {
          setBusy(false);
        }),
      'planner.composer_add_failed',
    );
  };
  return { ready: ready && !props.disabled && !busy, busy, submit };
}

function useComposer(props: ComposerProps): ComposerState {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const collections = usePlannerCollections(props.person);
  const [text, setText] = useState(props.text);
  const [chosen, choose] = useState<ComposerKind | null>(props.kind);
  const [ruleOn, setRuleOn] = useState(true);
  const asked = shownKindOf(props.target, chosen, null);
  const preview = useParsePreview(props.person, text, asked, timeZone);
  const { parsed } = preview;
  const kind = shownKindOf(props.target, chosen, parsed?.draft.kind ?? null);
  const plan = composerPlanOf({ kind, text, parsed, timeZone });
  const suggestion = kind === 'task' ? (preview.suggestions[0] ?? null) : null;
  const today = { now, timeZone };
  const next = plan === null ? null : nextLineOf(plan, parsed, today);
  const sending = useSubmit(props, {
    plan,
    current: preview.current,
    rule: ruleOn ? suggestion : null,
  });
  return {
    text,
    setText,
    kind,
    choose,
    tokens: composerTokens(text, readingOf(kind, text, parsed, collections)),
    colour: colourOf(collections, parsed?.draft.collection_id ?? null),
    chips: plan === null ? [] : willAddOf(plan, parsed, { collections, today }),
    status: statusOf(plan, preview.problem, next),
    suggestion,
    ruleOn,
    setRuleOn,
    ...sending,
  };
}

function ComposerField({
  state,
  target,
  disabled,
  onClose,
  inputRef,
}: {
  readonly state: ComposerState;
  readonly target: QuickAddTarget;
  readonly disabled: boolean;
  readonly onClose: () => void;
  readonly inputRef: RefObject<TextInput | null>;
}): ReactNode {
  const partner = PARTNER[state.kind];
  const switchKind = (): void => {
    state.choose(partner);
  };
  return (
    <TokenField
      value={state.text}
      onChange={state.setText}
      tokens={state.tokens}
      colour={state.colour}
      placeholder={disabled ? OFFLINE : PLACEHOLDER[state.kind]}
      label={TITLE[target]}
      disabled={state.busy}
      inputRef={inputRef}
      onSubmit={state.submit}
      onTab={COMPOSER_KINDS[target].includes(partner) ? switchKind : null}
      onEscape={onClose}
    />
  );
}

function ComposerBody(props: ComposerProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const inputRef = useRef<TextInput | null>(null);
  const state = useComposer(props);
  const kinds = COMPOSER_KINDS[props.target];
  return (
    <View className="gap-3">
      <View className="self-start">
        <Segmented
          options={kinds.map((kind) => KIND_OPTIONS[kind])}
          value={state.kind}
          onChange={state.choose}
          label="What to add"
        />
      </View>
      <ComposerField
        state={state}
        target={props.target}
        disabled={props.disabled}
        onClose={props.onClose}
        inputRef={inputRef}
      />
      <WillAdd chips={state.chips} labelled={pointer} />
      <StatusLine text={state.status.text} problem={state.status.problem} />
      {state.suggestion === null ? null : (
        <RuleCard suggestion={state.suggestion} on={state.ruleOn} onChange={state.setRuleOn} />
      )}
      <View className="flex-row flex-wrap items-center justify-end gap-3">
        {pointer ? <KeyHints kind={state.kind} /> : null}
        <Button
          label={ADD_LABEL[state.kind]}
          icon={state.kind === 'timer' ? 'play' : 'plus'}
          variant="filled"
          loading={state.busy}
          disabled={!state.ready}
          onPress={state.submit}
        />
      </View>
    </View>
  );
}

export function Composer(props: ComposerProps): ReactNode {
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      label={TITLE[props.target]}
      detents={['fit']}
      wide
    >
      {props.open ? <ComposerBody {...props} /> : null}
    </Sheet>
  );
}
