import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../../components/banner';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Sheet } from '../../../../components/sheet';
import { Tap } from '../../../../components/tap';
import { Text } from '../../../../components/text';
import type { RunStartBody } from '../../data/api';
import { Overrides } from './overrides';
import { PayloadForm } from './payload-form';
import { RunForReal } from './run-for-real';
import {
  TEST_BANNER,
  initialPayload,
  initialStartWith,
  missingFields,
  realRequest,
  startWithOptions,
  testRequest,
  type JsonRecord,
  type LastEvent,
  type PayloadField,
  type PretendRow,
  type StartWith,
  type StartWithOption,
  type TestDraft,
} from './test-model';

export interface TestSheetProps {
  readonly open: boolean;
  readonly automationId: string;
  readonly name: string;
  readonly fields: readonly PayloadField[];
  readonly lastEvent: LastEvent | null;
  readonly breakpoints: readonly string[];
  readonly starting: 'dry' | 'live' | null;
  readonly onClose: () => void;
  readonly onTest: (body: RunStartBody) => void;
  readonly onRealRun: (body: RunStartBody) => Promise<void>;
}

function StartCard({
  option,
  selected,
  onPick,
}: {
  readonly option: StartWithOption;
  readonly selected: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Tap
      label={`${option.title}. ${option.subtitle}`}
      role="radio"
      checked={selected}
      disabled={option.disabled}
      className={
        selected
          ? 'rounded-md border border-primary bg-primary-container'
          : 'rounded-md border border-outline-variant bg-surface-1'
      }
      onPress={onPick}
    >
      <View className="flex-row items-center gap-3 px-4 py-3">
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">{option.title}</Text>
          <Text variant="footnote" tone="variant">
            {option.subtitle}
          </Text>
        </View>
        {selected ? <Icon name="check" tone="primary" /> : null}
      </View>
    </Tap>
  );
}

function StartWithCards({
  last,
  value,
  onChange,
}: {
  readonly last: LastEvent | null;
  readonly value: StartWith;
  readonly onChange: (value: StartWith) => void;
}): ReactNode {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Start with" className="gap-2">
      <Text variant="body-strong">Start with</Text>
      {startWithOptions(last).map((option) => (
        <StartCard
          key={option.value}
          option={option}
          selected={option.value === value}
          onPick={() => {
            onChange(option.value);
          }}
        />
      ))}
    </View>
  );
}

function LastValues({ last }: { readonly last: LastEvent }): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="body-strong">What the trigger gives</Text>
      {Object.entries(last.values).map(([name, value]) => (
        <Text key={name} variant="callout" tone="variant">
          {`${name}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`}
        </Text>
      ))}
    </View>
  );
}

interface FooterProps {
  readonly draft: TestDraft;
  readonly problem: string | null;
  readonly automationId: string;
  readonly name: string;
  readonly breakpoints: readonly string[];
  readonly starting: TestSheetProps['starting'];
  readonly onTest: TestSheetProps['onTest'];
  readonly onRealRun: TestSheetProps['onRealRun'];
}

function Footer({
  draft,
  problem,
  automationId,
  name,
  breakpoints,
  starting,
  onTest,
  onRealRun,
}: FooterProps): ReactNode {
  const busy = starting !== null;
  return (
    <View className="gap-3">
      {problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {problem}
        </Text>
      )}
      <Button
        label="Run test"
        icon="play"
        size="lg"
        disabled={problem !== null || busy}
        loading={starting === 'dry'}
        onPress={() => {
          onTest(testRequest(automationId, draft, breakpoints));
        }}
      />
      <RunForReal
        name={name}
        disabled={problem !== null || busy}
        loading={starting === 'live'}
        onRun={() => onRealRun(realRequest(automationId, draft))}
      />
    </View>
  );
}

interface BodyProps {
  readonly fields: readonly PayloadField[];
  readonly lastEvent: LastEvent | null;
  readonly automationId: string;
  readonly busy: boolean;
  readonly startWith: StartWith;
  readonly values: JsonRecord;
  readonly rows: readonly PretendRow[];
  readonly onStartWith: (value: StartWith) => void;
  readonly onValues: (values: JsonRecord) => void;
  readonly onRows: (rows: readonly PretendRow[]) => void;
}

function Body({
  fields,
  lastEvent,
  automationId,
  busy,
  startWith,
  values,
  rows,
  onStartWith,
  onValues,
  onRows,
}: BodyProps): ReactNode {
  const issued = useRef(0);
  return (
    <View className="gap-5 px-4 pb-4">
      <Banner tone="info" title={TEST_BANNER.title} body={TEST_BANNER.body} wrapBody />
      <StartWithCards last={lastEvent} value={startWith} onChange={onStartWith} />
      {startWith === 'last' && lastEvent !== null ? (
        <LastValues last={lastEvent} />
      ) : (
        <View className="gap-2">
          <Text variant="body-strong">What the trigger gives</Text>
          <PayloadForm fields={fields} values={values} disabled={busy} onChange={onValues} />
        </View>
      )}
      <Overrides
        rows={rows}
        disabled={busy}
        automationId={automationId}
        newId={() => {
          issued.current += 1;
          return `pretend-${String(issued.current)}`;
        }}
        onChange={onRows}
      />
    </View>
  );
}

function Content(props: TestSheetProps): ReactNode {
  const { fields, lastEvent } = props;
  const [startWith, setStartWith] = useState<StartWith>(initialStartWith(lastEvent));
  const [values, setValues] = useState<JsonRecord>(() => initialPayload(fields));
  const [rows, setRows] = useState<readonly PretendRow[]>([]);
  const draft: TestDraft = { startWith, last: lastEvent, values, rows };
  const missing = startWith === 'form' ? missingFields(fields, values) : [];
  const problem = missing.length === 0 ? null : `Fill in ${missing.join(', ')}.`;
  const busy = props.starting !== null;
  return (
    <Sheet
      open={props.open}
      title={`Test ${props.name}`}
      detents={['full']}
      onClose={props.onClose}
      footer={
        <Footer
          draft={draft}
          problem={problem}
          automationId={props.automationId}
          name={props.name}
          breakpoints={props.breakpoints}
          starting={props.starting}
          onTest={props.onTest}
          onRealRun={props.onRealRun}
        />
      }
    >
      <Body
        fields={fields}
        lastEvent={lastEvent}
        automationId={props.automationId}
        busy={busy}
        startWith={startWith}
        values={values}
        rows={rows}
        onStartWith={setStartWith}
        onValues={setValues}
        onRows={setRows}
      />
    </Sheet>
  );
}

export function TestSheet(props: TestSheetProps): ReactNode {
  return <Content key={props.automationId} {...props} />;
}
