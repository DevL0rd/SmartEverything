import { useState, type ReactNode } from 'react';
import { TextField } from '../../../components/text-field';
import type { ItemChanges } from './repeat-scope-bar';

export function titleOf(text: string): string | null {
  const title = text.trim();
  return title === '' ? null : title;
}

export function ItemTitle({
  title,
  disabled,
  onChange,
}: {
  readonly title: string;
  readonly disabled: boolean;
  readonly onChange: (changes: ItemChanges) => void;
}): ReactNode {
  const [text, setText] = useState(title);
  const commit = (): void => {
    const next = titleOf(text);
    if (next === null) setText(title);
    else if (next !== title) onChange({ title: next });
  };
  return (
    <TextField
      label="Title"
      value={text}
      onChange={setText}
      onBlur={commit}
      onSubmit={commit}
      disabled={disabled}
    />
  );
}
