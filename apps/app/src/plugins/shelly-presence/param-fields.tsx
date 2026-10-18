import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Scalar } from '../../components/schema-scalar';
import { TextField } from '../../components/text-field';
import { replaceField, schemaType, type Schema } from '../../components/schema-values';
import { pickTextFile } from '../../platform/text-file';
import { nullableScalar, propertiesOf, secretText, stringList } from './action-schema';
import type { JsonRecord } from './form-model';
import { failure } from './use-presence-operation';
import { StringListInput } from './string-list-input';

const LONG_TEXT: ReadonlySet<string> = new Set(['data', 'code', 'body']);

interface FieldProps {
  readonly name: string;
  readonly field: Schema;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue | undefined) => void;
  readonly report: (message: string) => void;
}

function labelOf(name: string, field: Schema): string {
  return typeof field['title'] === 'string' ? field['title'] : name;
}

function ImportFile({ change, report }: Pick<FieldProps, 'change' | 'report'>): ReactNode {
  return (
    <Button
      label="Import file"
      icon="upload"
      variant="tonal"
      onPress={() => {
        pickTextFile('text/plain,application/x-pem-file,application/javascript,text/javascript')
          .then((text) => {
            if (text !== null) change(text);
          })
          .catch((error: unknown) => {
            report(failure(error));
          });
      }}
    />
  );
}

interface ControlProps extends FieldProps {
  readonly shown: Schema;
  readonly long: boolean;
}

function Control({ name, field, shown, value, change, long }: ControlProps): ReactNode {
  const masked =
    (secretText(field) || secretText(shown)) && schemaType(shown) === 'string' && !long;
  if (masked)
    return (
      <TextField
        label={labelOf(name, field)}
        kind="password"
        value={typeof value === 'string' ? value : ''}
        onChange={change}
      />
    );
  return (
    <Scalar
      schema={shown}
      value={value ?? ''}
      change={change}
      label={labelOf(name, field)}
      multiline={long}
    />
  );
}

function Field(props: FieldProps): ReactNode {
  const { name, field, value, change } = props;
  const nullable = nullableScalar(field);
  const shown = nullable ?? field;
  if (stringList(field))
    return (
      <StringListInput
        title={labelOf(name, field)}
        value={Array.isArray(value) ? value.map(String) : []}
        change={change}
      />
    );
  const long = LONG_TEXT.has(name) && schemaType(shown) === 'string';
  return (
    <View className="gap-2">
      <Control {...props} shown={shown} long={long} />
      {long ? <ImportFile change={change} report={props.report} /> : null}
      {nullable === null ? null : (
        <Button
          label={`Clear ${labelOf(name, field).toLowerCase()}`}
          variant="text"
          onPress={() => {
            change(null);
          }}
        />
      )}
    </View>
  );
}

export function ParamFields({
  schema,
  value,
  change,
  report,
}: {
  readonly schema: Schema;
  readonly value: JsonRecord;
  readonly change: (value: JsonRecord) => void;
  readonly report: (message: string) => void;
}): ReactNode {
  return Object.entries(propertiesOf(schema)).map(([name, field]) => (
    <Field
      key={name}
      name={name}
      field={field}
      value={value[name]}
      report={report}
      change={(next) => {
        change(replaceField(value, name, next === '' ? undefined : next));
      }}
    />
  ));
}
