import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { JSON_VALUE, type BoardWidget } from '@smarteverything/domain';
import { Banner } from '../../banner';
import { Sheet } from '../../sheet';
import { notify } from '../../toast-store';
import type { WidgetDefinition } from '../types';

const STORED_OPTIONS = z.record(z.string(), JSON_VALUE);

export type StoredOptions = z.infer<typeof STORED_OPTIONS>;

function storedOptions(value: unknown): StoredOptions | null {
  const parsed = STORED_OPTIONS.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function Editor({
  widget,
  definition,
  onChange,
}: {
  readonly widget: BoardWidget;
  readonly definition: WidgetDefinition;
  readonly onChange: (options: StoredOptions) => void;
}): ReactNode {
  const options = definition.instanceOptions;
  if (options === undefined) {
    return null;
  }
  const current = options.schema.safeParse(widget.options ?? {});
  if (!current.success) {
    return (
      <Banner
        tone="critical"
        title="These widget settings can't be read"
        action={{
          label: 'Start over',
          onPress: () => {
            onChange({});
          },
        }}
      />
    );
  }
  return options.editor({
    value: current.data,
    onChange: (value) => {
      const stored = storedOptions(value);
      if (stored === null) {
        notify({ message: 'That setting could not be saved', tone: 'critical' });
        return;
      }
      onChange(stored);
    },
  });
}

export interface WidgetOptionsProps {
  readonly widget: BoardWidget | null;
  readonly definition: WidgetDefinition | null;
  readonly onClose: () => void;
  readonly onChange: (key: string, options: StoredOptions) => void;
}

export function WidgetOptions({
  widget,
  definition,
  onClose,
  onChange,
}: WidgetOptionsProps): ReactNode {
  const open = widget !== null && definition !== null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={definition === null ? 'Widget options' : definition.title}
      detents={['fit']}
    >
      {widget === null || definition === null ? null : (
        <View className="gap-4 pt-2">
          <Editor
            widget={widget}
            definition={definition}
            onChange={(options) => {
              onChange(widget.key, options);
            }}
          />
        </View>
      )}
    </Sheet>
  );
}
