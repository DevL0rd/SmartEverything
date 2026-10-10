import type { ReactNode } from 'react';
import { Sheet } from '../../../components/sheet';
import { ModelPicker, type ModelPickerProps } from './model-picker';

export function ModelPickerSheet({
  open,
  onClose,
  title,
  header,
  ...picker
}: ModelPickerProps & {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly header?: ReactNode;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title={title} detents={['full']} scroll={false}>
      {header}
      {open ? <ModelPicker {...picker} /> : null}
    </Sheet>
  );
}
