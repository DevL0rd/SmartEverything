import { Logger } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { z } from 'zod';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { Button } from './button';
import { SchemaEditor } from './schema-editor';
import { schemaOf, type Schema } from './schema-values';
import { Text } from './text';
import { notify } from './toast-store';

const FIELD = z.looseObject({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'array']),
  title: z.string().optional(),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
  items: z.looseObject({ type: z.literal('string') }).optional(),
});
const SCHEMA = z.looseObject({
  type: z.literal('object'),
  properties: z.record(z.string(), FIELD),
  required: z.array(z.string()).optional(),
});
const REQUEST = z.looseObject({
  message: z.string().optional(),
  url: z.url({ protocol: /^https?$/ }).optional(),
  requestedSchema: SCHEMA.optional(),
});

function RequestedWebsite({
  url,
  pending,
}: {
  readonly url: string | undefined;
  readonly pending: boolean;
}): ReactNode {
  if (url === undefined) return null;
  return (
    <Button
      disabled={pending}
      label="Open requested website"
      variant="tonal"
      onPress={() => {
        void Linking.openURL(url).catch((error: unknown) => {
          log.warn('elicitation.open_failed', { reason: String(error), urlLength: url.length });
          notify({ message: 'Requested website could not be opened', error, tone: 'critical' });
        });
      }}
    />
  );
}

function RequestFields({
  request,
  schema,
  values,
  change,
  pending,
}: {
  readonly pending: boolean;
  readonly request: z.infer<typeof REQUEST> | null;
  readonly schema: Schema;
  readonly values: Schema;
  readonly change: (values: Schema) => void;
}): ReactNode {
  return (
    <>
      <Text variant="title-3">Native MCP request</Text>
      <Text>
        {request !== null
          ? (request.message ?? 'This MCP server requests information.')
          : 'Unsupported request shape. Answer on the supplying computer or cancel.'}
      </Text>
      <RequestedWebsite url={request?.url} pending={pending} />
      <SchemaEditor
        mode="elicitation"
        schema={schema}
        value={values}
        change={change}
        disabled={pending}
      />
    </>
  );
}

function ElicitationButtons({
  pending,
  enabled,
  values,
  submit,
}: {
  readonly pending: boolean;
  readonly enabled: boolean;
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly submit: (answer: {
    readonly action: 'accept' | 'decline' | 'cancel';
    readonly content?: Readonly<Record<string, JsonValue>>;
  }) => void;
}): ReactNode {
  return (
    <View className="flex-col gap-2">
      <Button
        label="Cancel"
        variant="tonal"
        loading={pending}
        onPress={() => {
          submit({ action: 'cancel' });
        }}
      />
      <Button
        label="Decline"
        variant="tonal"
        loading={pending}
        onPress={() => {
          submit({ action: 'decline' });
        }}
      />
      <Button
        label="Accept"
        disabled={!enabled}
        loading={pending}
        onPress={() => {
          submit({ action: 'accept', content: values });
        }}
      />
    </View>
  );
}

export function formSchemaOf(input: Readonly<Record<string, JsonValue>>): Schema {
  return REQUEST.safeParse(input).success ? schemaOf(input['requestedSchema']) : {};
}

const log = new Logger('app.provider');
function validForm(
  schema: unknown,
  values: Readonly<Record<string, JsonValue>>,
): { readonly valid: boolean; readonly reason: string | null } {
  if (schema === undefined) return { valid: true, reason: null };
  const checked = z.record(z.string(), JSON_VALUE).safeParse(schema);
  if (!checked.success) return { valid: false, reason: 'This runtime form schema cannot be read.' };
  try {
    return { valid: z.fromJSONSchema(checked.data).safeParse(values).success, reason: null };
  } catch (error) {
    log.warn('provider.form_schema_unsupported', { reason: String(error) });
    return {
      valid: false,
      reason: 'This runtime form schema is unsupported. Accept is unavailable.',
    };
  }
}
export function NativeElicitation({
  request: input,
  url,
  pending,
  submit,
}: {
  readonly request: Readonly<Record<string, JsonValue>>;
  readonly url: boolean;
  readonly pending: boolean;
  readonly submit: (answer: {
    readonly action: 'accept' | 'decline' | 'cancel';
    readonly content?: Readonly<Record<string, JsonValue>>;
  }) => void;
}): ReactNode {
  const [values, setValues] = useState<Schema>({});
  const request = REQUEST.safeParse(input);
  const schema = request.success ? request.data.requestedSchema : undefined;
  const validation = validForm(schema, values);
  const supported = request.success && (url || schema !== undefined);
  return (
    <View className="gap-4">
      <RequestFields
        request={request.success ? request.data : null}
        schema={formSchemaOf(input)}
        values={values}
        change={setValues}
        pending={pending}
      />
      {validation.reason === null ? null : <Text tone="warning">{validation.reason}</Text>}
      <ElicitationButtons
        pending={pending}
        enabled={supported ? validation.valid : false}
        values={values}
        submit={submit}
      />
    </View>
  );
}
