import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextField } from '../../../components/text-field';
import { numberValid, parsedNumber, shownText } from '../model/number-text';

interface NumberInputProps {
  readonly label: string;
  readonly value: number | undefined;
  readonly onChange: (value: number | undefined) => void;
  readonly optional?: boolean;
  readonly unit?: string | null;
  readonly focusOnMount?: boolean;
}

export function NumberInput({
  label,
  value,
  onChange,
  optional = false,
  unit = null,
  focusOnMount = false,
}: NumberInputProps): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const text = shownText(draft, value);
  return (
    <TextField
      label={unit === null ? label : `${label} (${unit})`}
      focusOnMount={focusOnMount}
      kind="number"
      value={text}
      error={numberValid(text, optional) ? null : 'Write a number.'}
      onBlur={() => {
        setDraft(null);
      }}
      onChange={(next) => {
        setDraft(next);
        if (optional && next.trim() === '') {
          onChange(undefined);
          return;
        }
        const number = parsedNumber(next);
        if (number !== null) onChange(number);
      }}
    />
  );
}
