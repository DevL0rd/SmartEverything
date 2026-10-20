import type { ReactNode } from 'react';
import { HSV_COLOR } from '@smarteverything/domain';
import { ColourPicker } from '../../../../../components/colour-picker';
import type { FieldControl } from '../schema-fields';
import type { LiteralProps } from './literal-scalar';

export function ColourLiteral({
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<Extract<FieldControl, { t: 'colour' }>>): ReactNode {
  const parsed = HSV_COLOR.safeParse(value);
  return (
    <ColourPicker
      label={label}
      disabled={disabled}
      value={parsed.success ? parsed.data : null}
      onChange={onChange}
      onCommit={onChange}
    />
  );
}
