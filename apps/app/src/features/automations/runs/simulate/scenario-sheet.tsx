import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../../components/banner';
import { Button } from '../../../../components/button';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { TimeField } from '../../../../components/time-field';
import { notifyFailure } from '../../../../components/toast-store';
import type { RunStartBody, TestBody } from '../../data/api';
import { Overrides } from '../test/overrides';
import type { PretendRow } from '../test/test-model';
import { clockOfTime, timeOfClock } from './clock-text';
import { ExpectationRows } from './expectation-rows';
import { OutcomeScripts } from './outcome-scripts';
import {
  SIMULATION_BANNER,
  defaultStart,
  eventTimes,
  saveProblem,
  scenarioProblem,
  simulateRequest,
  testBody,
  type EventRow,
  type ExpectationRow,
  type ScenarioDraft,
  type ScriptRow,
  type StartDraft,
} from './scenario-model';
import { TimelineRows } from './timeline-rows';

export interface ScenarioSheetProps {
  readonly open: boolean;
  readonly automationId: string;
  readonly name: string;
  readonly zone: string;
  readonly nowMs: number;
  readonly breakpoints: readonly string[];
  readonly starting: 'dry' | 'live' | null;
  readonly onClose: () => void;
  readonly onSimulate: (body: RunStartBody) => void;
  readonly onSave: (body: TestBody) => Promise<void>;
}

function StartFields({
  start,
  disabled,
  onChange,
}: {
  readonly start: StartDraft;
  readonly disabled: boolean;
  readonly onChange: (start: StartDraft) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="body-strong">Start</Text>
      <Text
        variant="footnote"
        tone="variant"
      >{`Your home as it is now, in ${start.zone} time.`}</Text>
      <TextField
        label="Start date (year-month-day)"
        kind="code"
        value={start.date}
        disabled={disabled}
        onChange={(date) => {
          onChange({ ...start, date });
        }}
      />
      <TimeField
        label="Start time"
        value={timeOfClock(start.clock)}
        onChange={(time) => {
          onChange({ ...start, clock: clockOfTime(time) });
        }}
      />
    </View>
  );
}

interface SaveProps {
  readonly name: string;
  readonly rows: readonly ExpectationRow[];
  readonly problem: string | null;
  readonly disabled: boolean;
  readonly newId: () => string;
  readonly onName: (name: string) => void;
  readonly onRows: (rows: readonly ExpectationRow[]) => void;
  readonly onSave: () => void;
}

function SaveSection(props: SaveProps): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="body-strong">Keep as a test</Text>
      <Text variant="footnote" tone="variant">
        A test replays this scenario later and checks what you list. Run all tests from the
        automation page.
      </Text>
      <TextField
        label="Test name"
        value={props.name}
        disabled={props.disabled}
        onChange={props.onName}
      />
      <ExpectationRows
        rows={props.rows}
        disabled={props.disabled}
        newId={props.newId}
        onChange={props.onRows}
      />
      {props.problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {props.problem}
        </Text>
      )}
      <View className="flex-row">
        <Button
          label="Save as test"
          icon="check"
          variant="tonal"
          disabled={props.problem !== null || props.disabled}
          onPress={props.onSave}
        />
      </View>
    </View>
  );
}

interface DraftState {
  readonly draft: ScenarioDraft;
  readonly testName: string;
  readonly expectations: readonly ExpectationRow[];
  readonly setStart: (start: StartDraft) => void;
  readonly setWorld: (rows: readonly PretendRow[]) => void;
  readonly setEvents: (rows: readonly EventRow[]) => void;
  readonly setScripts: (rows: readonly ScriptRow[]) => void;
  readonly setTestName: (name: string) => void;
  readonly setExpectations: (rows: readonly ExpectationRow[]) => void;
  readonly newId: (prefix: string) => string;
}

function useDraftState(nowMs: number, zone: string): DraftState {
  const [start, setStart] = useState<StartDraft>(() => defaultStart(nowMs, zone));
  const [world, setWorld] = useState<readonly PretendRow[]>([]);
  const [events, setEvents] = useState<readonly EventRow[]>([]);
  const [scripts, setScripts] = useState<readonly ScriptRow[]>([]);
  const [testName, setTestName] = useState('');
  const [expectations, setExpectations] = useState<readonly ExpectationRow[]>([]);
  const issued = useRef(0);
  return {
    draft: { start, world, events, scripts },
    testName,
    expectations,
    setStart,
    setWorld,
    setEvents,
    setScripts,
    setTestName,
    setExpectations,
    newId: (prefix): string => {
      issued.current += 1;
      return `${prefix}-${String(issued.current)}`;
    },
  };
}

function Footer({
  problem,
  disabled,
  loading,
  onRun,
}: {
  readonly problem: string | null;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onRun: () => void;
}): ReactNode {
  return (
    <View className="gap-3">
      {problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {problem}
        </Text>
      )}
      <Button
        label="Run simulation"
        icon="play"
        size="lg"
        disabled={problem !== null || disabled}
        loading={loading}
        onPress={onRun}
      />
    </View>
  );
}

function Intro({
  start,
  disabled,
  onChange,
}: {
  readonly start: StartDraft;
  readonly disabled: boolean;
  readonly onChange: (start: StartDraft) => void;
}): ReactNode {
  return (
    <>
      <Banner tone="info" title={SIMULATION_BANNER.title} body={SIMULATION_BANNER.body} wrapBody />
      <StartFields start={start} disabled={disabled} onChange={onChange} />
    </>
  );
}

function Script({
  state,
  zone,
  busy,
}: {
  readonly state: DraftState;
  readonly zone: string;
  readonly busy: boolean;
}): ReactNode {
  const { draft, newId } = state;
  return (
    <>
      <TimelineRows
        rows={draft.events}
        times={eventTimes(draft)}
        zone={zone}
        disabled={busy}
        newId={() => newId('event')}
        onChange={state.setEvents}
      />
      <OutcomeScripts
        rows={draft.scripts}
        disabled={busy}
        newId={() => newId('script')}
        onChange={state.setScripts}
      />
    </>
  );
}

function Body({
  state,
  automationId,
  zone,
  busy,
  onSave,
}: {
  readonly state: DraftState;
  readonly automationId: string;
  readonly zone: string;
  readonly busy: boolean;
  readonly onSave: () => void;
}): ReactNode {
  const { draft, newId } = state;
  return (
    <View className="gap-5 px-4 pb-4">
      <Intro start={draft.start} disabled={busy} onChange={state.setStart} />
      <Overrides
        rows={draft.world}
        disabled={busy}
        automationId={automationId}
        newId={() => newId('world')}
        onChange={state.setWorld}
      />
      <Script state={state} zone={zone} busy={busy} />
      <SaveSection
        name={state.testName}
        rows={state.expectations}
        problem={saveProblem(state.testName, draft, state.expectations)}
        disabled={busy}
        newId={() => newId('check')}
        onName={state.setTestName}
        onRows={state.setExpectations}
        onSave={onSave}
      />
    </View>
  );
}

function Content(props: ScenarioSheetProps): ReactNode {
  const state = useDraftState(props.nowMs, props.zone);
  const [saving, setSaving] = useState(false);
  const busy = props.starting !== null || saving;
  const save = (): void => {
    setSaving(true);
    background(
      props
        .onSave(testBody(state.testName, state.draft, state.expectations))
        .catch(notifyFailure('The test was not saved.'))
        .finally(() => {
          setSaving(false);
        }),
      'automations.simulation_save',
      { automationId: props.automationId },
    );
  };
  return (
    <Sheet
      open={props.open}
      title={`Simulate ${props.name}`}
      detents={['full']}
      onClose={props.onClose}
      footer={
        <Footer
          problem={scenarioProblem(state.draft)}
          disabled={busy}
          loading={props.starting === 'dry'}
          onRun={() => {
            props.onSimulate(simulateRequest(props.automationId, state.draft, props.breakpoints));
          }}
        />
      }
    >
      <Body
        state={state}
        automationId={props.automationId}
        zone={props.zone}
        busy={busy}
        onSave={save}
      />
    </Sheet>
  );
}

export function ScenarioSheet(props: ScenarioSheetProps): ReactNode {
  return <Content key={props.automationId} {...props} />;
}
