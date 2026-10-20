import type { ReactNode } from 'react';
import type { FieldControl } from '../schema-fields';
import { ReferencePicker } from './reference-picker';
import { SecretPicker } from './secret-picker';
import { TargetPicker } from './target-picker';
import type { LiteralProps } from './literal-scalar';

export function ReferenceLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<Extract<FieldControl, { t: 'reference' }>>): ReactNode {
  if (control.of === 'secret') {
    return <SecretPicker label={label} value={value} disabled={disabled} onChange={onChange} />;
  }
  if (control.of === 'target') {
    return <TargetPicker label={label} value={value} disabled={disabled} onChange={onChange} />;
  }
  return (
    <ReferencePicker
      of={control.of}
      capabilities={control.capabilities}
      label={label}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
