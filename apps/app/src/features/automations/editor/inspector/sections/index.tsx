import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Advanced } from './advanced';
import { Behaviour } from './behaviour';
import { CalledInputs } from './called-inputs';
import { DeleteStep } from './delete-step';
import { Fold } from './fold';
import { ForEachCollect, ForEachTogether } from './for-each-options';
import { GraphConnections } from './graph-connections';
import type { GraphSectionProps } from './graph-connections-model';
import { GraphJoinOptions } from './graph-join-options';
import { graphSectionOf } from './graph-panel';
import { GraphPaths } from './graph-paths';
import { GraphRowEditors } from './graph-row-editors';
import { GraphValuesAfter } from './graph-values-after';
import { Header } from './header';
import { ToolStep } from './tool-step';
import { Inputs, Timing } from './inputs';
import { Instance } from './instance';
import { LoopLimits } from './loop-limits';
import { LoopTarget } from './loop-target';
import { setMoreOptionsOpen, useMoreOptionsOpen } from './more-options-state';
import { Naming } from './naming';
import { OnError } from './on-error';
import { Outputs } from './outputs';
import { Problems } from './problems';
import { RawValues } from './raw-values';
import { ReturnExit } from './return-exit';
import { RunMode } from './run-mode';
import { RunValuesSection } from './run-values';
import type { SectionId } from './sections-model';
import { MORE_OPTIONS_HINT, inspectorLayout, moreOptionsSet } from './sections-model';
import type { SectionProps } from './section-types';

function onGraph(
  Component: (section: GraphSectionProps) => ReactNode,
): (props: SectionProps) => ReactNode {
  return function GraphSection(props: SectionProps): ReactNode {
    const { view, env, actions } = props;
    const node = env.graph.nodes.find((item) => item.id === view.id);
    return node === undefined ? null : <Component {...graphSectionOf(node, env, actions)} />;
  };
}

const SECTION_COMPONENTS: Readonly<Record<SectionId, (props: SectionProps) => ReactNode>> = {
  header: Header,
  problems: Problems,
  instance: Instance,
  inputs: Inputs,
  calledInputs: CalledInputs,
  tool: ToolStep,
  collect: ForEachCollect,
  target: LoopTarget,
  return: ReturnExit,
  rows: onGraph(GraphRowEditors),
  paths: onGraph(GraphPaths),
  join: onGraph(GraphJoinOptions),
  valuesAfter: onGraph(GraphValuesAfter),
  outputs: Outputs,
  mode: RunMode,
  run: RunValuesSection,
  connections: onGraph(GraphConnections),
  onError: OnError,
  naming: Naming,
  timing: Timing,
  behaviour: Behaviour,
  limits: LoopLimits,
  together: ForEachTogether,
  rawValues: RawValues,
  advanced: Advanced,
};

function Sections({
  ids,
  props,
}: {
  readonly ids: readonly SectionId[];
  readonly props: SectionProps;
}): ReactNode {
  return ids.map((id) => {
    const Component = SECTION_COMPONENTS[id];
    return <Component key={id} {...props} />;
  });
}

function MoreOptions({
  ids,
  section,
}: {
  readonly ids: readonly SectionId[];
  readonly section: SectionProps;
}): ReactNode {
  const open = useMoreOptionsOpen();
  const { view, env } = section;
  const set = moreOptionsSet(view, env.freePosition);
  return (
    <Fold
      title="More options"
      summary={set.length === 0 ? MORE_OPTIONS_HINT : set.join(', ')}
      icon="settings"
      raised
      open={open}
      onToggle={() => {
        setMoreOptionsOpen(!open);
      }}
    >
      <Sections ids={ids} props={section} />
    </Fold>
  );
}

export function NodeSections(props: SectionProps): ReactNode {
  const layout = inspectorLayout(props.view, props.env);
  return (
    <View className="gap-6 pb-6">
      <View className="gap-5">
        <Sections ids={layout.main} props={props} />
      </View>
      {layout.wiring.length === 0 ? null : (
        <View className="gap-5">
          <Sections ids={layout.wiring} props={props} />
        </View>
      )}
      <MoreOptions ids={layout.more} section={props} />
      <DeleteStep id={props.view.id} env={props.env} actions={props.actions} />
    </View>
  );
}
