import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { CollapseBody, CollapseRoot } from '../../../../components/disclosure';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { portDraft, type Draft, type PortDraft } from './dialog-model';
import type { InputRow, OutputRow } from './interface-rows';

type Side = 'inputs' | 'outputs';

export type PortEdit = (side: Side, port: string, change: Partial<PortDraft>) => void;

interface PortRowProps {
  readonly name: string;
  readonly meta: string;
  readonly lines: readonly string[];
  readonly draft: PortDraft;
  readonly onChange: (change: Partial<PortDraft>) => void;
}

function PortRow({ name, meta, lines, draft, onChange }: PortRowProps): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <CollapseRoot className="gap-1 border-b border-outline-variant py-2">
      <View className="min-h-touch-min flex-row items-center gap-2">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong" numberOfLines={1}>
            {draft.label.trim() === '' ? name : draft.label.trim()}
          </Text>
          <Text variant="footnote" tone="variant">
            {meta}
          </Text>
          {lines.map((line) => (
            <Text key={line} variant="footnote" tone="variant">
              {line}
            </Text>
          ))}
        </View>
        <Button
          label={open ? 'Done' : 'Edit'}
          variant="text"
          onPress={() => {
            setOpen((current) => !current);
          }}
        />
      </View>
      {open ? (
        <CollapseBody className="gap-2 pb-2">
          <TextField
            label="Label"
            value={draft.label}
            placeholder={name}
            onChange={(label) => {
              onChange({ label });
            }}
          />
          <TextField
            label="Description"
            value={draft.description}
            multiline
            onChange={(description) => {
              onChange({ description });
            }}
          />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}

export function InputRows({
  rows,
  draft,
  onEdit,
}: {
  readonly rows: readonly InputRow[];
  readonly draft: Draft;
  readonly onEdit: PortEdit;
}): ReactNode {
  return (
    <View>
      {rows.map((row) => (
        <PortRow
          key={row.name}
          name={row.name}
          meta={`${row.typeText} · ${row.required ? 'required' : 'optional'}`}
          lines={[row.reason, row.was]}
          draft={portDraft(draft, 'inputs', row.name)}
          onChange={(change) => {
            onEdit('inputs', row.name, change);
          }}
        />
      ))}
    </View>
  );
}

export function OutputRows({
  rows,
  draft,
  onEdit,
}: {
  readonly rows: readonly OutputRow[];
  readonly draft: Draft;
  readonly onEdit: PortEdit;
}): ReactNode {
  return (
    <View>
      {rows.map((row) => (
        <PortRow
          key={row.name}
          name={row.name}
          meta={row.optional ? `${row.typeText} · only sometimes` : row.typeText}
          lines={[row.usedBy]}
          draft={portDraft(draft, 'outputs', row.name)}
          onChange={(change) => {
            onEdit('outputs', row.name, change);
          }}
        />
      ))}
    </View>
  );
}
