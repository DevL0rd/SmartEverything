import type { ReactNode } from 'react';
import { BottomSheet } from '../../../components/bottom-sheet';
import { DialogFrame } from '../../../components/dialog-frame';
import { useIdiom } from '../../../design/platform';
import { FolderPicker } from './folder-picker';
import { HubFolderPicker } from './hub-folder-picker';

interface SheetFrame {
  readonly open: boolean;
  readonly start?: string | null;
  readonly onClose: () => void;
  readonly onChoose?: (path: string) => void;
}

export type FolderPickerSheetProps = SheetFrame &
  (
    | {
        readonly source: { readonly kind: 'computer'; readonly deviceId: string };
        readonly mode: 'folder' | 'file';
      }
    | { readonly source: { readonly kind: 'hub' }; readonly mode: 'folder' }
  );

function pickerBody(props: FolderPickerSheetProps, compact: boolean): ReactNode {
  const { onClose, start = null } = props;
  const choose = (path: string): void => {
    onClose();
    props.onChoose?.(path);
  };
  if (props.source.kind === 'hub') {
    return <HubFolderPicker start={start} compact={compact} onCancel={onClose} onChoose={choose} />;
  }
  return (
    <FolderPicker
      deviceId={props.source.deviceId}
      mode={props.mode}
      start={start}
      compact={compact}
      onCancel={onClose}
      onChoose={choose}
    />
  );
}

export function FolderPickerSheet(props: FolderPickerSheetProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const title = props.mode === 'folder' ? 'Choose folder' : 'Choose file';
  const frame = { open: props.open, onClose: props.onClose, title, label: title, scroll: false };
  const body = pickerBody(props, touch);
  if (touch) {
    return (
      <BottomSheet {...frame} detents={['fit']} compact>
        {body}
      </BottomSheet>
    );
  }
  return (
    <DialogFrame {...frame} kind="dialog" wide>
      {body}
    </DialogFrame>
  );
}
