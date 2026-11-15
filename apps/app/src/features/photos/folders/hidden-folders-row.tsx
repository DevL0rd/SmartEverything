import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoHiddenFolder } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Icon, type IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useHiddenFolders } from './data';
import { useHideAction } from './folder-toggles';

const KIND_ICON: Readonly<Record<PhotoHiddenFolder['kind'], IconName>> = {
  phone: 'smartphone',
  computer: 'monitor',
  drive: 'folder',
};

const KIND_LABEL: Readonly<Record<PhotoHiddenFolder['kind'], string>> = {
  phone: 'Phone album',
  computer: 'Computer folder',
  drive: 'Drive folder',
};

export function hiddenValueOf(total: number | undefined): string | undefined {
  if (total === undefined) return undefined;
  if (total === 0) return 'None';
  return total === 1 ? '1 folder' : `${count(total)} folders`;
}

function HiddenEntry({ folder }: { readonly folder: PhotoHiddenFolder }): ReactNode {
  const toggle = useHideAction();
  return (
    <View className="min-h-14 flex-row items-center gap-3 py-1">
      <View className="size-10 items-center justify-center rounded-md bg-surface-3">
        <Icon name={KIND_ICON[folder.kind]} size={18} tone="variant" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="label" numberOfLines={1}>
          {folder.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {KIND_LABEL[folder.kind]}
        </Text>
      </View>
      <Button
        label="Show"
        spoken={`Show ${folder.name} in Photos`}
        icon="eye"
        variant="tonal"
        onPress={() => {
          toggle({ key: folder.key, name: folder.name, hidden: true });
        }}
      />
    </View>
  );
}

function HiddenList(): ReactNode {
  const hidden = useHiddenFolders();
  if (hidden.isPending) return <Skeleton shape="line" className="h-14" />;
  if (hidden.isError) {
    return (
      <ErrorState
        error={hidden.error}
        retry={() => {
          background(hidden.refetch(), 'photos_settings.hidden_folders_refetch_failed');
        }}
      />
    );
  }
  if (hidden.data.folders.length === 0) {
    return (
      <EmptyState
        compact
        icon="eye"
        title="No hidden folders"
        body="Hide a folder from Folders in Photos to keep its photos out of the Library."
      />
    );
  }
  return hidden.data.folders.map((folder) => <HiddenEntry key={folder.key} folder={folder} />);
}

export function HiddenFoldersRow(): ReactNode {
  const total = useHiddenFolders().data?.folders.length;
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const close = (): void => {
    setOpen(false);
  };
  const value = hiddenValueOf(total);
  return (
    <>
      <ListRow
        title="Hidden folders"
        subtitle="Kept out of the Library and other views. Backup keeps running."
        wrapSubtitle
        pressRef={opener}
        {...(value === undefined ? {} : { value })}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <Sheet
          subpage={{ opener }}
          open
          onClose={close}
          title="Hidden folders"
          detents={['fit']}
          footer={
            <View className="min-w-0 flex-1 flex-row gap-2">
              <Button
                label="Open folders"
                variant="tonal"
                icon="folder"
                grow
                href={href.photosPage('folders')}
              />
              <Button label="Done" grow onPress={close} />
            </View>
          }
        >
          <HiddenList />
        </Sheet>
      ) : null}
    </>
  );
}
