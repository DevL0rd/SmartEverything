import { z } from 'zod';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Button } from './button';
import { ActionRow, NavRow, SelectRow } from './rows';
import { SearchField } from './search-field';
import { List } from './section';
import { Scalar } from './schema-scalar';
import { SchemaForm } from './schema-form';
import { Sheet } from './sheet';
import { Text } from './text';
import { TextField } from './text-field';
import {
  arrayOf,
  branches,
  initialValue,
  matchesType,
  replaceField,
  schemaOf,
  schemaType,
  valueSummary,
  variantName,
  type Schema,
} from './schema-values';
interface NodeProps {
  readonly schema: Schema;
  readonly value: JsonValue;
  readonly change: (value: JsonValue) => void;
}
interface EditorProps {
  readonly schema: Schema;
  readonly value: Schema;
  readonly change: (value: Schema) => void;
  readonly initialSearch?: string;
  readonly searchPlaceholder?: string;
  readonly exclusions?: Readonly<Record<string, string>>;
  readonly mode?: 'browse' | 'elicitation';
  readonly disabled?: boolean;
}
function UnionNode({ schema, value, change }: NodeProps): ReactNode {
  const variants = branches(schema);
  const [chosen, choose] = useState(
    Math.max(
      0,
      variants.findIndex((variant) => matchesType(variant, value)),
    ),
  );
  const current = variants[chosen] ?? {};
  return (
    <View className="gap-4">
      <SelectRow
        title="Value type"
        value={String(chosen)}
        options={variants.map((variant, index) => ({
          value: String(index),
          label: variantName(variant, index),
        }))}
        onChange={(index) => {
          choose(Number(index));
          change(initialValue(variants[Number(index)] ?? {}));
        }}
      />
      {typeof current['description'] === 'string' ? (
        <Text tone="variant">{current['description']}</Text>
      ) : null}
      <SchemaNode key={chosen} schema={current} value={value} change={change} />
    </View>
  );
}
function FieldSheet({
  schema,
  value,
  save,
  close,
  title,
}: {
  readonly schema: Schema;
  readonly value: JsonValue;
  readonly save: (value: JsonValue) => void;
  readonly close: () => void;
  readonly title: string;
}): ReactNode {
  const [draft, change] = useState(value);
  const checked = z.fromJSONSchema(schema).safeParse(draft);
  return (
    <Sheet open title={title} onClose={close} detents={['full']}>
      <View className="gap-4">
        {typeof schema['description'] === 'string' ? (
          <Text tone="variant">{schema['description']}</Text>
        ) : null}
        <SchemaNode schema={schema} value={draft} change={change} />
        {checked.success ? null : (
          <Text tone="critical">
            {checked.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}
          </Text>
        )}
        <Button
          label="Use this value"
          disabled={!checked.success}
          onPress={() => {
            save(draft);
            close();
          }}
        />
      </View>
    </Sheet>
  );
}
function ObjectRows({
  fields,
  query,
  value,
  change,
  choose,
}: {
  readonly fields: readonly string[];
  readonly query: string;
  readonly value: Schema;
  readonly change: (value: Schema) => void;
  readonly choose: (name: string) => void;
}): ReactNode {
  return (
    <List>
      {fields
        .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
        .map((name) => (
          <View key={name}>
            <NavRow
              title={name}
              subtitle={valueSummary(value[name])}
              onPress={() => {
                choose(name);
              }}
            />
            {value[name] === undefined ? null : (
              <ActionRow
                title={`Omit ${name}`}
                onPress={() => {
                  change(replaceField(value, name, undefined));
                }}
              />
            )}
          </View>
        ))}
    </List>
  );
}
function NewEntry({
  value,
  add,
}: {
  readonly value: Schema;
  readonly add: (name: string) => void;
}): ReactNode {
  const [name, setName] = useState('');
  return (
    <View className="gap-3">
      <TextField label="New entry name" value={name} onChange={setName} />
      <Button
        label="Add entry"
        disabled={name.trim() === '' || Object.hasOwn(value, name)}
        onPress={() => {
          add(name);
          setName('');
        }}
      />
    </View>
  );
}
function ExclusionRows({
  exclusions,
  query,
}: {
  readonly exclusions: Readonly<Record<string, string>>;
  readonly query: string;
}): ReactNode {
  return Object.entries(exclusions)
    .filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
    .map(([name, reason]) => (
      <View key={name} className="gap-1">
        <Text variant="body-strong">{name} · Unavailable</Text>
        <Text selectable tone="variant">
          {reason}
        </Text>
      </View>
    ));
}
function ObjectFields({
  schema,
  value,
  change,
  exclusions = {},
  initialSearch = '',
  searchPlaceholder = 'Find a native setting',
}: EditorProps): ReactNode {
  const [query, setQuery] = useState(initialSearch);
  const [key, setKey] = useState<string | null>(null);
  const properties = schemaOf(schema['properties']);
  const fields = Array.from(new Set([...Object.keys(properties), ...Object.keys(value)]));
  const arbitrary =
    schema['additionalProperties'] !== false && schema['additionalProperties'] !== undefined;
  const fieldSchema =
    key === null ? {} : schemaOf(properties[key] ?? schema['additionalProperties']);
  return (
    <View className="gap-3">
      <SearchField value={query} onChange={setQuery} placeholder={searchPlaceholder} />
      <ObjectRows fields={fields} query={query} value={value} change={change} choose={setKey} />
      {arbitrary ? <NewEntry value={value} add={setKey} /> : null}
      <ExclusionRows exclusions={exclusions} query={query} />
      {key === null ? null : (
        <FieldSheet
          key={key}
          schema={fieldSchema}
          value={value[key] === undefined ? initialValue(fieldSchema) : value[key]}
          title={key}
          close={() => {
            setKey(null);
          }}
          save={(next) => {
            change(replaceField(value, key, next));
          }}
        />
      )}
    </View>
  );
}
function ArrayNode({ schema, value, change }: NodeProps): ReactNode {
  const items = arrayOf(value);
  const [chosen, choose] = useState<number | null>(null);
  const itemSchema = schemaOf(schema['items']);
  return (
    <View className="gap-3">
      <List>
        {items.map((entry, index) => (
          <View key={index}>
            <NavRow
              title={`Item ${String(index + 1)}`}
              subtitle={valueSummary(entry)}
              onPress={() => {
                choose(index);
              }}
            />
            <ActionRow
              title={`Remove item ${String(index + 1)}`}
              onPress={() => {
                change(items.filter((_, at) => at !== index));
              }}
            />
          </View>
        ))}
      </List>
      <Button
        label="Add item"
        onPress={() => {
          change([...items, initialValue(itemSchema)]);
          choose(items.length);
        }}
      />
      {chosen === null ? null : (
        <FieldSheet
          key={chosen}
          title={`Item ${String(chosen + 1)}`}
          schema={itemSchema}
          value={items[chosen] ?? initialValue(itemSchema)}
          close={() => {
            choose(null);
          }}
          save={(next) => {
            change(items.map((entry, index) => (index === chosen ? next : entry)));
          }}
        />
      )}
    </View>
  );
}
function SchemaNode(props: NodeProps): ReactNode {
  if (Object.keys(props.schema).length === 0)
    return (
      <UnionNode
        {...props}
        schema={{
          anyOf: ['string', 'number', 'boolean', 'object', 'array', 'null'].map((type) => ({
            type,
            ...(type === 'object' ? { additionalProperties: true } : {}),
          })),
        }}
      />
    );
  if (branches(props.schema).length > 0) return <UnionNode {...props} />;
  const type = schemaType(props.schema);
  if (type === 'object')
    return (
      <ObjectFields schema={props.schema} value={schemaOf(props.value)} change={props.change} />
    );
  if (type === 'array') return <ArrayNode {...props} />;
  return <Scalar {...props} />;
}
export function SchemaEditor({
  mode = 'browse',
  disabled = false,
  ...props
}: EditorProps): ReactNode {
  if (mode === 'elicitation') {
    return (
      <SchemaForm
        schema={props.schema}
        value={props.value}
        change={props.change}
        disabled={disabled}
      />
    );
  }
  if (branches(props.schema).length > 0)
    return (
      <SchemaNode
        schema={props.schema}
        value={props.value}
        change={(next) => {
          props.change(schemaOf(next));
        }}
      />
    );
  return <ObjectFields {...props} />;
}
