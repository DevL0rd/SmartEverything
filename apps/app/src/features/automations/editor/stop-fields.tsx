import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Action } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';

type Stop = Extract<Action, { type: 'stop' }>;

interface StopFieldsProps {
  readonly action: Stop;
  readonly catalog: Catalog;
  readonly onChange: (action: Stop) => void;
}

function StopTargetType({ action, onChange }: StopFieldsProps): ReactNode {
  const target = action.target;
  return (
    <Select
      label="Stop"
      value={target.type}
      options={[
        { value: 'current', label: 'This run' },
        { value: 'automation', label: 'An automation’s runs' },
        { value: 'sequence', label: 'A sequence’s runs' },
        { value: 'run', label: 'A specific run' },
      ]}
      onChange={(type) => {
        if (type === 'current') onChange({ ...action, target: { type } });
        else if (type === 'run') onChange({ ...action, target: { type, runId: '' } });
        else onChange({ ...action, target: { type, id: '' } });
      }}
    />
  );
}

export function StopFields({ action, catalog, onChange }: StopFieldsProps): ReactNode {
  const target = action.target;
  const named =
    target.type === 'automation' ? (catalog.automations ?? []) : (catalog.sequences ?? []);
  return (
    <View className="gap-3">
      <StopTargetType action={action} catalog={catalog} onChange={onChange} />
      {target.type === 'automation' || target.type === 'sequence' ? (
        <>
          <Select
            label={target.type === 'automation' ? 'Automation' : 'Sequence'}
            value={target.id}
            searchable
            options={named.map((row) => ({ value: row.id, label: row.name }))}
            onChange={(id) => {
              onChange({ ...action, target: { ...target, id } });
            }}
          />
          <TextField
            label="Only this control key (optional)"
            value={target.controlKey ?? ''}
            onChange={(key) => {
              onChange({
                ...action,
                target: {
                  type: target.type,
                  id: target.id,
                  ...(key.trim() === '' ? {} : { controlKey: key }),
                },
              });
            }}
          />
        </>
      ) : target.type === 'run' ? (
        <TextField
          label="Run ID"
          value={target.runId}
          onChange={(runId) => {
            onChange({ ...action, target: { type: 'run', runId } });
          }}
        />
      ) : null}
      <Text variant="footnote" tone="variant">
        Stops future steps and waits. Commands already sent may still complete.
      </Text>
    </View>
  );
}
