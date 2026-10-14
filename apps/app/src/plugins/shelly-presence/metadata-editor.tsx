import type { ReactNode } from 'react';
import { z } from 'zod';
import { View } from 'react-native';
import { TextField } from '../../components/text-field';
import { SwitchRow } from '../../components/rows';
import { StringListInput } from './string-list-input';
import { atPath, withPath, PRESENCE_FORM_OBJECT, type PresenceFormObject } from './form-model';
import { StringPairsInput } from './string-pairs-input';

interface MetadataProps {
  readonly value: PresenceFormObject;
  readonly change: (value: PresenceFormObject) => void;
}
const TEXT_FIELDS = [
  { key: 'name', label: 'Display name' },
  { key: 'view', label: 'Display style' },
  { key: 'unit', label: 'Unit' },
  { key: 'icon', label: 'Icon' },
] as const;
function textAt(value: PresenceFormObject, path: string): string {
  const found = atPath(value, path);
  return typeof found === 'string' || typeof found === 'number' ? String(found) : '';
}
function stringsAt(value: PresenceFormObject, path: string): readonly string[] {
  const parsed = z.array(z.string()).safeParse(atPath(value, path));
  return parsed.success ? parsed.data : [];
}

function MetadataIdentity({ value, change }: MetadataProps): ReactNode {
  return (
    <View className="gap-3">
      {TEXT_FIELDS.map((field) => (
        <TextField
          key={field.key}
          label={field.label}
          value={textAt(value, `ui.${field.key}`)}
          onChange={(next) => {
            change(
              withPath(
                value,
                `ui.${field.key}`,
                (field.key === 'name' || field.key === 'icon') && next === '' ? null : next,
              ),
            );
          }}
        />
      ))}
      <SwitchRow
        title="Visible"
        value={atPath(value, 'ui.visible') !== false}
        onChange={(next) => {
          change(withPath(value, 'ui.visible', next));
        }}
      />
      <TextField
        label="Display order"
        kind="number"
        value={textAt(value, 'ui.order')}
        onChange={(next) => {
          change(withPath(value, 'ui.order', next));
        }}
      />
    </View>
  );
}
function MetadataLabels({ value, change }: MetadataProps): ReactNode {
  const titleMap = PRESENCE_FORM_OBJECT.safeParse(atPath(value, 'ui.titles'));
  if (titleMap.success)
    return (
      <StringPairsInput
        title="Labels"
        value={titleMap.data}
        change={(next) => {
          change(withPath(value, 'ui.titles', next));
        }}
      />
    );
  return (
    <StringListInput
      title="Label"
      maximum={100}
      value={stringsAt(value, 'ui.titles')}
      change={(next) => {
        change(withPath(value, 'ui.titles', next));
      }}
    />
  );
}

export function MetadataEditor(props: MetadataProps): ReactNode {
  const { value, change } = props;
  return (
    <View className="gap-3">
      <MetadataIdentity {...props} />
      <TextField
        label="Number control step"
        kind="number"
        value={textAt(value, 'ui.step')}
        onChange={(next) => {
          change(withPath(value, 'ui.step', next));
        }}
      />
      <MetadataLabels {...props} />
      <StringListInput
        title="Button icon"
        maximum={20}
        value={stringsAt(value, 'ui.buttonIcons')}
        change={(next) => {
          change(withPath(value, 'ui.buttonIcons', next));
        }}
      />
      <StringPairsInput
        title="Images"
        value={PRESENCE_FORM_OBJECT.parse(atPath(value, 'ui.images') ?? {})}
        change={(next) => {
          change(withPath(value, 'ui.images', next));
        }}
      />
    </View>
  );
}
