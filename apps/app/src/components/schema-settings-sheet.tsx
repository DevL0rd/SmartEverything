import { useRef, useState, type ReactNode } from 'react';
import type { View } from 'react-native';
import { Button } from './button';
import { ListRow } from './list-row';
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
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(focus !== undefined);
  const close = (): void => {
    setOpen(false);
  };
  return (
    <>
      <ListRow
        pressRef={opener}
        chevron
        title="All native settings"
        subtitle={`${String(Object.keys(schemaOf(schema['properties'])).length)} SDK fields · nested values and runtime resets`}
        onPress={() => {
          setOpen(true);
        }}
      />
      <Sheet
        open={open}
        onClose={close}
        title="Native SDK settings"
        detents={['full']}
        subpage={{ opener }}
      >
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
