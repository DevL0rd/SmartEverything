import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../components/text';
import { useValue } from '../design/external-store';
import { toggleNavFolder } from './nav-edit-actions';
import { HiddenPages } from './nav-hidden-pages';
import { navIntent } from './nav-groups';
import type { NavFolderView, NavModel, NavNodeView } from './nav-model';
import { DisclosureRow, NavRow } from './nav-row';
import { goFromDirectory, navShown } from './nav-sheet-state';

function Label({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="caption" tone="variant" className="px-4 pb-1">
      {text}
    </Text>
  );
}

function summaryOf(folder: NavFolderView): string {
  return folder.items.length === 1 ? '1 item' : `${String(folder.items.length)} items`;
}

function FolderGroup({ folder }: { readonly folder: NavFolderView }): ReactNode {
  return (
    <View>
      <DisclosureRow
        icon={folder.icon}
        title={folder.title}
        summary={summaryOf(folder)}
        open={folder.open}
        active={folder.active}
        onPress={() => {
          toggleNavFolder(folder.key);
        }}
      />
      {folder.open
        ? folder.items.map((entry) => (
            <NavRow
              key={entry.key}
              entry={entry}
              nested
              onPress={() => {
                goFromDirectory(entry);
              }}
              onIntent={() => {
                navIntent(entry);
              }}
            />
          ))
        : null}
    </View>
  );
}

function NodeRow({ node }: { readonly node: NavNodeView }): ReactNode {
  if (node.kind === 'folder') return <FolderGroup folder={node} />;
  return (
    <NavRow
      entry={node}
      onPress={() => {
        goFromDirectory(node);
      }}
      onIntent={() => {
        navIntent(node);
      }}
    />
  );
}

function PinnedRows({ model }: { readonly model: NavModel }): ReactNode {
  return (
    <View className="gap-0.5">
      {model.overflow.length === 0 ? null : <Label text="Pinned" />}
      {model.overflow.map((node) => (
        <NodeRow key={node.key} node={node} />
      ))}
      {model.system.map((entry) => (
        <NodeRow key={entry.key} node={entry} />
      ))}
    </View>
  );
}

export function SheetPages(): ReactNode {
  const model = useValue(navShown);
  if (model === null) return null;
  return (
    <View className="gap-section-gap">
      <PinnedRows model={model} />
      <HiddenPages hidden={model.hidden} title="More pages" />
    </View>
  );
}
