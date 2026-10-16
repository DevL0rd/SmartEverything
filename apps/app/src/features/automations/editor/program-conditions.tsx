import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Condition, Conditions } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { describeCondition } from '../model/describe';
import {
  conditionLabel,
  conditionWithInput,
  newProgramCondition,
  programConditionChoices,
} from '../model/program-conditions';
import { ConditionFields } from './condition-fields';
import { StepCard } from './step-card';
import { BindingFields } from './binding-fields';
import { TypedComparisonFields } from './typed-comparison-fields';

interface ConditionProps {
  readonly condition: Condition;
  readonly catalog: Catalog;
  readonly onChange: (condition: Condition) => void;
}
interface ValueConditionProps extends ConditionProps {
  readonly condition: Extract<Condition, { type: 'value' }>;
}

function ValueConditionFields({ condition, catalog, onChange }: ValueConditionProps): ReactNode {
  const row = catalog.values?.find((value) => value.id === condition.valueId);
  return (
    <View className="gap-3">
      <Select
        label="Value"
        searchable
        value={condition.valueId}
        options={(catalog.values ?? []).map((value) => ({
          value: value.id,
          label: value.content.name,
        }))}
        onChange={(id) => {
          const selected = catalog.values?.find((value) => value.id === id);
          if (selected !== undefined)
            onChange({
              ...condition,
              valueId: selected.id,
              comparison: { operator: 'eq', value: selected.content.value },
            });
        }}
      />
      {row === undefined ? (
        <Text variant="callout" tone="critical">
          This Value is unavailable.
        </Text>
      ) : (
        <TypedComparisonFields
          kind={row.content.kind}
          comparison={condition.comparison}
          catalog={catalog}
          onChange={(comparison) => {
            onChange({ ...condition, comparison });
          }}
        />
      )}
    </View>
  );
}
export function ProgramConditionFields({
  condition,
  catalog,
  onChange,
}: ConditionProps): ReactNode {
  if (condition.type === 'value')
    return <ValueConditionFields condition={condition} catalog={catalog} onChange={onChange} />;
  if (condition.type === 'binding')
    return (
      <View className="gap-3">
        <BindingFields
          input={condition.input}
          catalog={catalog}
          onChange={(input) => {
            onChange(conditionWithInput(condition, input));
          }}
        />
        <TypedComparisonFields
          kind={condition.input.binding.kind}
          comparison={condition.comparison}
          catalog={catalog}
          onChange={(comparison) => {
            onChange({ ...condition, comparison });
          }}
        />
      </View>
    );
  return <ConditionFields condition={condition} devices={catalog.devices} onChange={onChange} />;
}
interface ProgramConditionsProps {
  readonly conditions: Conditions;
  readonly catalog: Catalog;
  readonly onChange: (conditions: Conditions) => void;
}
interface ConditionCardProps extends ProgramConditionsProps {
  readonly condition: Condition;
  readonly index: number;
}
function ConditionCard({
  conditions,
  catalog,
  onChange,
  condition,
  index,
}: ConditionCardProps): ReactNode {
  return (
    <StepCard
      kind={conditionLabel(condition)}
      icon="activity"
      summary={describeCondition(catalog.names, condition)}
      onRemove={() => {
        onChange({
          ...conditions,
          items: conditions.items.filter((_, position) => position !== index),
        });
      }}
    >
      <ProgramConditionFields
        condition={condition}
        catalog={catalog}
        onChange={(item) => {
          onChange({
            ...conditions,
            items: conditions.items.map((entry, position) => (position === index ? item : entry)),
          });
        }}
      />
    </StepCard>
  );
}
export function ProgramConditions(props: ProgramConditionsProps): ReactNode {
  const { conditions, catalog, onChange } = props;
  return (
    <View className="gap-3">
      <Select
        label="Match"
        value={conditions.mode}
        options={[
          { value: 'all', label: 'All conditions' },
          { value: 'any', label: 'Any condition' },
        ]}
        onChange={(mode) => {
          onChange({ ...conditions, mode });
        }}
      />
      {conditions.items.map((condition, index) => (
        <ConditionCard key={String(index)} {...props} condition={condition} index={index} />
      ))}
      <Select
        label="Add a condition"
        value={null}
        searchable
        options={programConditionChoices(catalog)}
        onChange={(type) => {
          const condition = newProgramCondition(type, catalog);
          if (condition !== null)
            onChange({ ...conditions, items: [...conditions.items, condition] });
        }}
      />
      {conditions.items.length === 0 && conditions.mode === 'all' ? (
        <Text variant="footnote" tone="variant">
          No restrictions.
        </Text>
      ) : null}
    </View>
  );
}
