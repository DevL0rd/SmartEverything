import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Advanced } from './advanced';
import { Behaviour } from './behaviour';
import { ContainerRows } from './container-rows';
import { FailAgain } from './fail-again';
import { ForEachOptions } from './for-each-options';
import { Header } from './header';
import { Inputs } from './inputs';
import { Instance } from './instance';
import { LoopLimits } from './loop-limits';
import { LoopTarget } from './loop-target';
import { Notes } from './notes';
import { Outputs } from './outputs';
import { Problems } from './problems';
import { ReturnExit } from './return-exit';
import { RunValuesSection } from './run-values';
import type { SectionId } from './sections-model';
import { sectionsFor } from './sections-model';
import type { SectionProps } from './section-types';
import { StructuredOutputs } from './structured-outputs';

const SECTION_COMPONENTS: Readonly<Record<SectionId, (props: SectionProps) => ReactNode>> = {
  header: Header,
  problems: Problems,
  instance: Instance,
  inputs: Inputs,
  together: ForEachOptions,
  target: LoopTarget,
  return: ReturnExit,
  failAgain: FailAgain,
  outputs: Outputs,
  rows: ContainerRows,
  structured: StructuredOutputs,
  limits: LoopLimits,
  behaviour: Behaviour,
  notes: Notes,
  advanced: Advanced,
  run: RunValuesSection,
};

export function NodeSections(props: SectionProps): ReactNode {
  return (
    <View className="gap-5 pb-6">
      {sectionsFor(props.view, props.env).map((id) => {
        const Component = SECTION_COMPONENTS[id];
        return <Component key={id} {...props} />;
      })}
    </View>
  );
}
