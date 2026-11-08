import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Section } from '../../../../../components/section';
import { JsonLiteral } from '../values/literal-composite';
import { portOps } from './edits';
import { textFields } from './inputs-model';
import type { SectionProps } from './section-types';

export function RawValues({ view, env, actions }: SectionProps): ReactNode {
  if (view.kind === undefined) return null;
  const fields = textFields(view.kind, view.node);
  return (
    <Section title="Edit as text" caption="The same values as above, written as JSON.">
      <View className="gap-3 px-4 py-2">
        {fields.map((field) => {
          const port = view.node.ports?.[field.name];
          return (
            <JsonLiteral
              key={field.name}
              control={field.control}
              label={field.title}
              value={port !== undefined && 'lit' in port ? port.lit : undefined}
              disabled={env.locked}
              onChange={(lit) => {
                actions.apply(portOps(view.key, field.name, { lit }));
              }}
            />
          );
        })}
      </View>
    </Section>
  );
}
