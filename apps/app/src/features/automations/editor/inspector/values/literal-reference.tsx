import type { ReactNode } from 'react';
import type { FieldControl } from '../schema-fields';
import { EntityPicker } from './entity-picker';
import { ReferencePicker } from './reference-picker';
import { SecretPicker } from './secret-picker';
import { TargetPicker } from './target-picker';
import type { LiteralProps } from './literal-scalar';

export const LOADING_LIST = 'Loading the list';

export function ReferenceLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
  showLabel = true,
}: LiteralProps<Extract<FieldControl, { t: 'reference' }>>): ReactNode {
  if (control.of === 'secret') {
    return <SecretPicker label={label} value={value} disabled={disabled} onChange={onChange} />;
  }
  if (control.of === 'target') {
    return (
      <TargetPicker
        label={label}
        value={value}
        disabled={disabled}
        capabilities={control.capabilities}
        onChange={onChange}
      />
    );
  }
  return (
    <ReferencePicker
      of={control.of}
      capabilities={control.capabilities}
      label={label}
      showLabel={showLabel}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export function EntityLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
  showLabel = true,
}: LiteralProps<Extract<FieldControl, { t: 'entity' }>>): ReactNode {
  return (
    <EntityPicker
      of={control.of}
      label={label}
      showLabel={showLabel}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
