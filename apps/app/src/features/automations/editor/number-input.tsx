import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextField } from '../../../components/text-field';

function numberText(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '' : String(value);
}

interface NumberInputProps {
  readonly label: string;
  readonly value: number | undefined;
  readonly onChange: (value: number | undefined) => void;
  readonly optional?: boolean;
  readonly focusOnMount?: boolean;
}

export function NumberInput({
  label,
  value,
  onChange,
  optional = false,
  focusOnMount = false,
}: NumberInputProps): ReactNode {
  const [buffer, setBuffer] = useState({ value, text: numberText(value) });
  const text = Object.is(buffer.value, value) ? buffer.text : numberText(value);
  const valid =
    (optional && text.trim() === '') || (text.trim() !== '' && Number.isFinite(Number(text)));
  return (
    <TextField
      label={label}
      focusOnMount={focusOnMount}
      kind="number"
      value={text}
      error={valid ? null : 'Enter a finite number'}
      onChange={(next) => {
        const number =
          optional && next.trim() === ''
            ? undefined
            : next.trim() === ''
              ? Number.NaN
              : Number(next);
        setBuffer({ value: number, text: next });
        onChange(number);
      }}
    />
  );
}
