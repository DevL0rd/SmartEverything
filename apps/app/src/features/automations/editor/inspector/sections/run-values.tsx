import type { ReactNode } from 'react';
import { View } from 'react-native';
import { NumberStepper } from '../../../../../components/number-stepper';
import { Section } from '../../../../../components/section';
import { StructuredValue } from '../../../../../components/structured-value';
import type { SectionProps } from './section-types';

export function RunValuesSection({ view, env, actions }: SectionProps): ReactNode {
  const { run } = env;
  if (run === null) return null;
  return (
    <Section title="Run values">
      <View className="gap-3 px-4">
        {run.iterations > 1 ? (
          <NumberStepper
            label="Pass"
            value={run.iteration + 1}
            min={1}
            max={run.iterations}
            step={1}
            onChange={(pass) => {
              actions.selectIteration(pass - 1);
            }}
          />
        ) : null}
        <StructuredValue title="Went in" value={run.inputs} />
        <StructuredValue title="Came out" value={run.outputs} />
        {view.kind?.stateful === true && run.memory !== undefined ? (
          <StructuredValue title="Remembers" value={run.memory} />
        ) : null}
      </View>
    </Section>
  );
}
