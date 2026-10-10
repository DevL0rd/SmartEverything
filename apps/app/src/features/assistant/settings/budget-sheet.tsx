import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { errorText } from '../../../format/errors';

export interface BudgetField {
  readonly key: string;
  readonly label: string;
  readonly helper: string;
  readonly unit: 'usd' | 'minutes';
  readonly initial: number | null;
  readonly min: number;
  readonly max: number;
}

export type BudgetValues = Readonly<Record<string, number>>;

const NUMBER = z.coerce.number();

function parsedOf(
  fields: readonly BudgetField[],
  drafts: Readonly<Record<string, string>>,
): Record<string, number> | null {
  const values: Record<string, number> = {};
  for (const field of fields) {
    const parsed = NUMBER.min(field.min).max(field.max).safeParse(drafts[field.key]);
    if (!parsed.success) {
      return null;
    }
    values[field.key] = field.unit === 'minutes' ? Math.round(parsed.data) : parsed.data;
  }
  return values;
}

export interface BudgetSheetProps {
  readonly title: string;
  readonly fields: readonly BudgetField[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave: (values: BudgetValues) => Promise<void>;
  readonly onTurnOff: () => Promise<void>;
}

function useSubmit(onClose: () => void): {
  readonly busy: boolean;
  readonly error: string | null;
  readonly run: (action: () => Promise<void>) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (cause) {
      setError(errorText(cause).title);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function BudgetSheet(props: BudgetSheetProps): ReactNode {
  const { title, fields, open, onClose, onSave, onTurnOff } = props;
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.initial?.toString() ?? ''])),
  );
  const { busy, error, run } = useSubmit(onClose);
  const values = parsedOf(fields, drafts);
  const footer = (
    <View className="flex-row gap-2">
      {fields.some((field) => field.initial !== null) ? (
        <Button label="Turn off" variant="outlined" onPress={() => void run(onTurnOff)} />
      ) : null}
      <Button
        label="Save"
        grow
        loading={busy}
        disabled={values === null}
        onPress={() => {
          if (values !== null) {
            void run(() => onSave(values));
          }
        }}
      />
    </View>
  );
  return (
    <Sheet open={open} onClose={onClose} title={title} detents={['fit']} footer={footer}>
      <View className="gap-3 pb-2">
        {fields.map((field, index) => (
          <TextField
            key={field.key}
            label={field.label}
            kind="number"
            value={drafts[field.key] ?? ''}
            onChange={(text) => {
              setDrafts({ ...drafts, [field.key]: text });
            }}
            placeholder={field.unit === 'usd' ? '5.00' : '60'}
            helper={field.helper}
            error={index === fields.length - 1 ? error : null}
            focusOnMount={index === 0}
          />
        ))}
      </View>
    </Sheet>
  );
}
