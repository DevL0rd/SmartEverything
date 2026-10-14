import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { NavRow } from './rows';
import { Sheet } from './sheet';
import { SchemaEditor } from './schema-editor';
import { schemaOf, type Schema } from './schema-values';
export function SchemaSettingsSheet({
  schema,
  value,
  change,
  exclusions = {},
  focus,
}: {
  readonly schema: Schema;
  readonly value: Schema;
  readonly change: (value: Schema) => void;
  readonly exclusions?: Readonly<Record<string, string>>;
  readonly focus?: string;
}): ReactNode {
  const [open, setOpen] = useState(focus !== undefined);
  const close = (): void => {
    setOpen(false);
  };
  return (
    <>
      <NavRow
        title="All native settings"
        subtitle={`${String(Object.keys(schemaOf(schema['properties'])).length)} SDK fields · nested values and runtime resets`}
        onPress={() => {
          setOpen(true);
        }}
      />
      <Sheet open={open} onClose={close} title="Native SDK settings" detents={['full']}>
        {open ? (
          <SchemaEditor
            schema={schema}
            value={value}
            change={change}
            exclusions={exclusions}
            {...(focus === undefined ? {} : { initialSearch: focus })}
          />
        ) : null}
        <Button label="Done editing settings" onPress={close} />
      </Sheet>
    </>
  );
}
