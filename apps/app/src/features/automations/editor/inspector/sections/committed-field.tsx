import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextField, type FieldKind } from '../../../../../components/text-field';

export interface CommittedFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (text: string) => void;
  readonly validate?: (text: string) => string | undefined;
  readonly kind?: FieldKind;
  readonly helper?: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly disabled?: boolean;
}

export function CommittedField({
  label,
  value,
  onCommit,
  validate,
  kind,
  helper,
  placeholder,
  multiline,
  disabled,
}: CommittedFieldProps): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const problem = draft === null ? undefined : validate?.(draft);
  const commit = (): void => {
    if (draft === null || problem !== undefined) return;
    setDraft(null);
    if (draft !== value) onCommit(draft);
  };
  return (
    <TextField
      label={label}
      value={shown}
      onChange={setDraft}
      onSubmit={commit}
      onBlur={commit}
      error={problem ?? null}
      {...(kind === undefined ? {} : { kind })}
      {...(helper === undefined ? {} : { helper })}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(multiline === undefined ? {} : { multiline })}
      {...(disabled === undefined ? {} : { disabled })}
    />
  );
}
