import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import type { AutomationRunSummary } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { ErrorState } from '../../../../components/error-state';
import { Skeleton } from '../../../../components/skeleton';
import { confirm } from '../../../../components/confirm-store';
import { notifyFailure } from '../../../../components/toast-store';
import { useSizeClass } from '../../../../design/size-class';
import { useStableCallback } from '../../../../design/use-stable-callback';
import { background } from '@smarteverything/logging';
import { useRunActions } from '../../data/use-runs';
import { selectIds } from '../../editor/host/intent-env';
import type { SceneOptions } from '../../editor/host/use-canvas-props';
import type { DocumentStore } from '../../model/editor/document-store';
import { NodePane } from './commands-pane';
import { useFollow, type Follow } from './follow';
import { LoopStepper } from './loop-stepper';
import { EMPTY_FACTS, programFacts } from './program-facts';
import { RunCanvas, useSelectedNode } from './run-canvas';
import { RunFailure } from './run-failure';
import { DEFAULT_ITEM_NAME, activationFor } from './run-overlay';
import { RunHeader } from './run-header';
import { TimelineBand } from './timeline-band';
import { timelineStartsOpen } from './run-timeline';
import { useRunOverlay, type RunOverlayModel } from './use-run-overlay';
import { usePinnedProgram } from './use-pinned-program';
import { useRunRecords } from './use-run-records';

export interface RunScreenProps {
  readonly runId: string;
  readonly options: SceneOptions;
  readonly zone: string | null;
  readonly onScreen: boolean;
  readonly onReplay: (run: AutomationRunSummary) => void;
  readonly onOpenEditor: (run: AutomationRunSummary, nodeId: string | null) => void;
}

const CANVAS_MIN_HEIGHT = { minHeight: 240 } as const;
const NO_GROW = { flexGrow: 0 } as const;

function Loading(): ReactNode {
  return (
    <View className="gap-3 px-gutter py-4">
      <Skeleton shape="line" className="h-16" />
      <Skeleton shape="line" className="h-64" />
    </View>
  );
}

interface BodyProps extends RunScreenProps {
  readonly run: AutomationRunSummary;
  readonly store: DocumentStore;
  readonly model: RunOverlayModel;
  readonly itemNames: ReadonlyMap<string, string>;
  readonly titles: ReadonlyMap<string, string>;
  readonly stateful: ReadonlySet<string>;
}

function useStop(run: AutomationRunSummary): { readonly stop: () => void } {
  const actions = useRunActions();
  const stop = useStableCallback((): void => {
    background(
      (async (): Promise<void> => {
        const accepted = await confirm({
          title: 'Stop this run?',
          body: 'Commands already sent may still finish.',
          confirmLabel: 'Stop',
          tone: 'destructive',
        });
        if (accepted) await actions.stop(run.id);
      })().catch(notifyFailure('The run could not be stopped.')),
      'automations.run_stop',
      { runId: run.id },
    );
  });
  return { stop };
}

interface TopProps extends BodyProps {
  readonly follow: Follow;
  readonly selected: string | null;
}

function Top(props: TopProps): ReactNode {
  const { run, model, follow, selected } = props;
  const { stop } = useStop(run);
  return (
    <RunHeader
      run={run}
      status={model.status ?? run.status}
      zone={props.zone}
      active={model.active}
      canFollow={model.active}
      following={follow.on}
      stopping={run.status === 'cancelling'}
      onFollow={follow.toggle}
      onStop={stop}
      onReplay={() => {
        props.onReplay(run);
      }}
      onOpenEditor={() => {
        props.onOpenEditor(run, selected);
      }}
    />
  );
}

function Bottom({
  run,
  store,
  model,
  titles,
  stateful,
  selected,
}: BodyProps & { readonly selected: string | null }): ReactNode {
  const pane = activationFor(model.activations, model.chosen, selected);
  const compact = useSizeClass().width === 'compact';
  const [open, setOpen] = useState(timelineStartsOpen(compact, useWindowDimensions().height));
  return (
    <ScrollView className="max-h-80 shrink-0" style={NO_GROW}>
      <View className="w-full max-w-detail gap-2 px-gutter py-2">
        {model.timeline === null ? null : (
          <View className="self-start">
            <Button
              label={open ? 'Hide timeline' : 'Show timeline'}
              icon={open ? 'chevronDown' : 'chevronUp'}
              variant="text"
              onPress={() => {
                setOpen((current) => !current);
              }}
            />
          </View>
        )}
        <RunFailure error={run.error} />
        {selected === null ? null : (
          <NodePane
            title={titles.get(selected) ?? selected}
            activation={pane}
            stateful={stateful.has(selected)}
          />
        )}
        {model.timeline === null || !open ? null : (
          <TimelineBand
            model={model.timeline}
            at={model.at}
            selected={selected}
            onScrub={model.scrub}
            onSelect={(nodeId) => {
              selectIds(store, [nodeId]);
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

function Body(props: BodyProps): ReactNode {
  const { store, model, itemNames } = props;
  const selected = useSelectedNode(store);
  const follow = useFollow(model.running, model.live);
  const [opening] = useState(model.running);
  const stepPass = useStableCallback((nodeId: string, delta: -1 | 1): void => {
    const info = model.loops.find((loop) => loop.nodeId === nodeId);
    const iteration = info?.iterations[info.position - 1 + delta];
    if (iteration !== undefined) model.pick(nodeId, iteration);
  });
  return (
    <View className="flex-1">
      <Top {...props} follow={follow} selected={selected} />
      {model.loops.map((info) => (
        <LoopStepper
          key={info.nodeId}
          info={info}
          name={itemNames.get(info.nodeId) ?? DEFAULT_ITEM_NAME}
          onPick={model.pick}
        />
      ))}
      <View className="flex-1" style={CANVAS_MIN_HEIGHT}>
        <RunCanvas
          store={store}
          options={props.options}
          overlay={model.overlay}
          focusNode={follow.focusNode ?? opening}
          onScreen={props.onScreen}
          onSettled={follow.settled}
          onStepPass={stepPass}
        />
      </View>
      <Bottom {...props} selected={selected} />
    </View>
  );
}

export function RunScreen(props: RunScreenProps): ReactNode {
  const records = useRunRecords(props.runId);
  const run = records.data?.run ?? null;
  const pin = useMemo(
    () => (run === null ? null : { automationId: run.automation_id, revision: run.revision }),
    [run],
  );
  const pinned = usePinnedProgram(pin);
  const facts = useMemo(
    () => (pinned.program === null ? EMPTY_FACTS : programFacts(pinned.program, props.options)),
    [pinned.program, props.options],
  );
  const model = useRunOverlay({
    runId: props.runId,
    records: records.data,
    titles: facts.titles,
    itemNames: facts.itemNames,
    zone: props.zone,
    onScreen: props.onScreen,
  });
  const failed = records.isError ? records : pinned.query.isError ? pinned.query : null;
  if (failed !== null) {
    return (
      <View className="w-full max-w-reading px-gutter">
        <ErrorState
          error={failed.error}
          retry={() => {
            background(failed.refetch(), 'automations.run_refetch');
          }}
        />
      </View>
    );
  }
  if (run === null || pinned.store === null) return <Loading />;
  return (
    <Body
      {...props}
      run={run}
      store={pinned.store}
      model={model}
      titles={facts.titles}
      itemNames={facts.itemNames}
      stateful={facts.stateful}
    />
  );
}
