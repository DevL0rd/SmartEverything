import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Select } from '../../components/select';
import { TextField } from '../../components/text-field';
import { Button } from '../../components/button';
interface ComparisonDraft {
  readonly attribute: string | null;
  readonly operator: string;
  readonly value: string;
  readonly combine: string;
}
function literal(type: string | undefined, value: string): string | number | boolean {
  if (type === 'boolean') return value === 'true';
  return type === 'number' ? Number(value) : value;
}
function validLiteral(type: string | undefined, value: string): boolean {
  if (type === 'number') return value.trim() !== '' && Number.isFinite(Number(value));
  return type !== 'boolean' || value === 'true' || value === 'false';
}
function ComparisonInput({
  draft,
  type,
  change,
}: {
  readonly draft: ComparisonDraft;
  readonly type: string | undefined;
  readonly change: (value: ComparisonDraft) => void;
}): ReactNode {
  const boolean = type === 'boolean';
  return (
    <View className="gap-3">
      <Select
        label="Comparison"
        value={draft.operator}
        options={(boolean ? ['==', '!='] : ['==', '!=', '>', '>=', '<', '<=']).map((value) => ({
          value,
          label: value,
        }))}
        onChange={(operator) => {
          change({ ...draft, operator });
        }}
      />
      {boolean ? (
        <Select
          label="Compare with"
          value={draft.value}
          options={[
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' },
          ]}
          onChange={(value) => {
            change({ ...draft, value });
          }}
        />
      ) : (
        <TextField
          label="Compare with"
          kind={type === 'number' ? 'number' : 'text'}
          value={draft.value}
          onChange={(value) => {
            change({ ...draft, value });
          }}
        />
      )}
    </View>
  );
}
export interface ConditionAttribute {
  readonly name: string;
  readonly type: string;
  readonly desc?: string | undefined;
}
interface ConditionProps {
  readonly attributes: readonly ConditionAttribute[];
  readonly condition: string;
  readonly change: (value: string) => void;
}
export function ConditionBuilder({ attributes, condition, change }: ConditionProps): ReactNode {
  const [draft, setDraft] = useState<ComparisonDraft>({
    attribute: null,
    operator: '==',
    value: '',
    combine: 'replace',
  });
  const chosen = attributes.find((entry) => entry.name === draft.attribute);
  const apply = (): void => {
    if (chosen === undefined) return;
    const expression = `(ev[${JSON.stringify(chosen.name)}] ${draft.operator} ${JSON.stringify(literal(chosen.type, draft.value))})`;
    change(
      condition === '' || draft.combine === 'replace'
        ? expression
        : `(${condition}) ${draft.combine === 'and' ? '&&' : '||'} ${expression}`,
    );
  };
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <AttributeInput
        attributes={attributes}
        value={draft.attribute}
        change={(attribute) => {
          setDraft({ ...draft, attribute });
        }}
      />
      <ComparisonInput draft={draft} type={chosen?.type} change={setDraft} />
      <CombineInput
        value={draft.combine}
        change={(combine) => {
          setDraft({ ...draft, combine });
        }}
      />
      <Button
        label="Use condition"
        variant="tonal"
        disabled={chosen === undefined || !validLiteral(chosen.type, draft.value)}
        onPress={apply}
      />
    </View>
  );
}

function CombineInput({
  value,
  change,
}: {
  readonly value: string;
  readonly change: (value: string) => void;
}): ReactNode {
  return (
    <Select
      label="Apply condition"
      value={value}
      options={[
        { value: 'replace', label: 'Replace expression' },
        { value: 'and', label: 'Also require (AND)' },
        { value: 'or', label: 'Alternatively (OR)' },
      ]}
      onChange={change}
    />
  );
}

function AttributeInput({
  attributes,
  value,
  change,
}: {
  readonly attributes: readonly ConditionAttribute[];
  readonly value: string | null;
  readonly change: (value: string) => void;
}): ReactNode {
  return (
    <Select
      label="Condition attribute"
      value={value}
      options={attributes.map((entry) => ({ value: entry.name, label: entry.desc ?? entry.name }))}
      onChange={change}
    />
  );
}
