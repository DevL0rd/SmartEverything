import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { CrumbTrail } from './folder-bar';
import type { Crumb } from './path-model';

export interface FileToolbarProps {
  readonly crumbs: readonly Crumb[];
  readonly canGoUp: boolean;
  readonly sourceWord: string;
  readonly wide: boolean;
  readonly searching: boolean;
  readonly showHidden: boolean;
  readonly disabled: boolean;
  readonly onGo: (path: string) => void;
  readonly onUp: () => void;
  readonly onSearch: () => void;
  readonly onHidden: () => void;
  readonly onNewFolder: () => void;
  readonly onUpload: () => void;
  readonly onEnterPath: () => void;
}

function menuOf(props: FileToolbarProps): readonly MenuItem[] {
  const create: readonly MenuItem[] = props.wide
    ? []
    : [
        { label: 'New folder', icon: 'plus', onPress: props.onNewFolder, disabled: props.disabled },
        {
          label: `Upload from ${props.sourceWord}`,
          icon: 'upload',
          onPress: props.onUpload,
          disabled: props.disabled,
        },
      ];
  return [
    ...create,
    {
      label: props.showHidden ? 'Hide hidden files' : 'Show hidden files',
      icon: props.showHidden ? 'eyeOff' : 'eye',
      onPress: props.onHidden,
    },
    { label: 'Enter path', icon: 'route', onPress: props.onEnterPath },
  ];
}

export function FileToolbar(props: FileToolbarProps): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <IconButton
        icon="arrowUp"
        label="Up one folder"
        disabled={!props.canGoUp}
        onPress={props.onUp}
      />
      <View className="min-w-0 flex-1">
        <CrumbTrail crumbs={props.crumbs} onGo={props.onGo} />
      </View>
      {props.wide ? (
        <>
          <Button
            label="New folder"
            variant="tonal"
            icon="plus"
            disabled={props.disabled}
            onPress={props.onNewFolder}
          />
          <Button
            label={`Upload from ${props.sourceWord}`}
            variant="tonal"
            icon="upload"
            disabled={props.disabled}
            onPress={props.onUpload}
          />
        </>
      ) : null}
      <IconButton
        icon="search"
        label="Search in this folder"
        variant={props.searching ? 'tonal' : 'standard'}
        selected={props.searching}
        onPress={props.onSearch}
      />
      <OverflowButton items={menuOf(props)} label="Folder menu" />
    </View>
  );
}
