import { useRef, useState, type ReactNode } from 'react';
import type { View } from 'react-native';
import type { DrivePlacement, DriveRoot } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { FolderPickerSheet } from '../../computers/files/folder-picker-sheet';
import { lineToneOf } from '../placements/placement-row';
import { placementWordsOf } from '../placements/placement-status';
import { childPath, parentPath, usePlacementChange } from '../placements/use-placements';
import { repathBodyOf } from '../mount/mount-model';

export const UNKNOWN_ROOT = 'Library folder';

export function rootNameOf(placement: DrivePlacement, roots: readonly DriveRoot[]): string {
  return roots.find((root) => root.id === placement.rootId)?.label ?? UNKNOWN_ROOT;
}

export function PlacementPathRow({
  placement,
  name,
  needBytes,
}: {
  readonly placement: DrivePlacement;
  readonly name: string;
  readonly needBytes: number;
}): ReactNode {
  const opener = useRef<View>(null);
  const [picking, setPicking] = useState(false);
  const change = usePlacementChange();
  const words = placementWordsOf(placement, needBytes);
  const held = placement.hold !== null;
  return (
    <>
      <ListRow
        title={name}
        subtitle={placement.localPath}
        caption={change.problem ?? words.line}
        subtitleTone="variant"
        icon={placement.mode === 'mounted' ? 'hardDrive' : 'folderSync'}
        iconTone={lineToneOf(words)}
        label={`${name}, ${words.line}, at ${placement.localPath}`}
        disabled={held || change.busy}
        chevron={!held}
        pressRef={opener}
        {...(held
          ? {}
          : {
              onPress: (): void => {
                setPicking(true);
              },
            })}
      />
      <FolderPickerSheet
        open={picking}
        mode="folder"
        source={{ kind: 'computer', deviceId: placement.deviceId }}
        start={parentPath(placement.localPath)}
        onClose={() => {
          setPicking(false);
        }}
        onChoose={(parent) => {
          change.set(repathBodyOf(placement, childPath(parent, name)));
        }}
      />
    </>
  );
}

export function NoneHere({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="px-4 py-3">
      {text}
    </Text>
  );
}
