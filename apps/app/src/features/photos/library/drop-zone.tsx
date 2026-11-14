import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useFileDrop } from '../../../platform/file-drop';
import type { PickedBlob, PickedFile } from '../../../platform/pick-files';
import { dropText } from './upload-model';
import { useUploadPath } from './uploads';

export function hasBlob(file: PickedFile): file is PickedBlob {
  return 'blob' in file && typeof file.blob === 'function';
}

function DropTarget(): ReactNode {
  const path = useUploadPath();
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 z-10 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/8"
    >
      <View className="size-14 items-center justify-center rounded-lg bg-primary-container">
        <Icon name="upload" size={24} tone="onPrimaryContainer" />
      </View>
      <Text variant="title-3">Drop to upload</Text>
      <Text variant="callout" tone="variant" align="center">
        {dropText(path)}
      </Text>
    </View>
  );
}

export function DropZone({
  onFiles,
  children,
}: {
  readonly onFiles: (files: readonly PickedBlob[]) => void;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useRef<View>(null);
  const [hovering, setHovering] = useState(false);
  useFileDrop(ref, {
    onHover: setHovering,
    onFiles: (files) => {
      onFiles(files.filter(hasBlob));
    },
  });
  return (
    <View ref={ref} className="min-h-0 flex-1">
      {children}
      {hovering ? <DropTarget /> : null}
    </View>
  );
}
