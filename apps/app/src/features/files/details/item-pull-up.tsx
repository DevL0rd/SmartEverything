import type { ReactNode } from 'react';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { downloadNode, nodeKeyOf } from '../quick-look/node-files';
import { detailLineOf } from '../source/node';
import type { FileLinks, FileNode, SourceActionSpec } from '../source/types';
import { useSourceLinks } from '../source/source-hooks';
import { quickActionsOf, sizeTextOf, type QuickAction } from './details-model';
import type { DetailsHost, DetailsProps } from './details-host';
import { DetailsTabs } from './details-tabs';
import { detailsActionsOf } from './info-tab';
import { NodeGlyph } from './node-glyph';
import { rememberTab } from './tab-memory';

const PULL_UP_DETENTS = ['half', 'full'] as const;

function attachActionOf<O>(host: DetailsHost<O>, node: FileNode<O>): SourceActionSpec<O> | null {
  return host.source.actions([node]).find((action) => action.id === 'attach') ?? null;
}

interface QuickSpec {
  readonly label: string;
  readonly icon: IconName;
}

function specOf(action: QuickAction, node: FileNode): QuickSpec {
  switch (action) {
    case 'preview':
      return { label: 'Preview', icon: 'eye' };
    case 'star':
      return { label: node.marks.starred ? 'Starred' : 'Star', icon: 'star' };
    case 'chat':
      return { label: 'To chat', icon: 'messageCircle' };
    case 'download':
      return { label: 'Download', icon: 'download' };
    case 'trash':
      return { label: 'Trash', icon: 'trash' };
  }
}

function QuickFace({
  spec,
  active,
}: {
  readonly spec: QuickSpec;
  readonly active: boolean;
}): ReactNode {
  return (
    <>
      <View className="h-10 w-14 items-center justify-center rounded-full bg-surface-2">
        <Icon name={spec.icon} size={20} tone={active ? 'primary' : 'default'} />
      </View>
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {spec.label}
      </Text>
    </>
  );
}

const QUICK_CLASS = 'min-w-0 flex-1 items-center gap-1.5 rounded-md py-1';

function QuickButton({
  spec,
  active,
  onPress,
}: {
  readonly spec: QuickSpec;
  readonly active: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive role="button" label={spec.label} onPress={onPress} className={QUICK_CLASS}>
      <QuickFace spec={spec} active={active} />
    </Interactive>
  );
}

const MORE_SPEC: QuickSpec = { label: 'More', icon: 'ellipsis' };

function QuickMore({
  items,
  name,
}: {
  readonly items: readonly MenuItem[];
  readonly name: string;
}): ReactNode {
  const label = `More actions for ${name}`;
  const { ref, open, menu } = useAnchoredMenu(items, label);
  return (
    <View ref={ref} collapsable={false} className="min-w-0 flex-1">
      <Interactive role="button" label={label} onPress={open} className={QUICK_CLASS}>
        <QuickFace spec={MORE_SPEC} active={false} />
      </Interactive>
      {menu}
    </View>
  );
}

function moreItemsOf<O>(
  host: DetailsHost<O>,
  node: FileNode<O>,
  chat: boolean,
): readonly MenuItem[] {
  return detailsActionsOf(host.source, node)
    .filter((action) => !(chat && action.id === 'attach'))
    .map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      onPress: (): void => {
        action.run([node]);
      },
    }));
}

function useQuickRun<O>(
  { node, host }: DetailsProps<O>,
  links: FileLinks,
): (action: QuickAction) => void {
  return (action) => {
    switch (action) {
      case 'preview':
        rememberTab('preview');
        return;
      case 'star':
        host.act(node.marks.starred ? 'unstar' : 'star', [node]);
        return;
      case 'chat':
        attachActionOf(host, node)?.run([node]);
        return;
      case 'download':
        downloadNode(node, links);
        return;
      case 'trash':
        host.act('trash', [node]);
        host.close();
    }
  };
}

function QuickRow<O>({
  links,
  ...props
}: DetailsProps<O> & { readonly links: FileLinks }): ReactNode {
  const run = useQuickRun(props, links);
  const { node, host } = props;
  const actions = quickActionsOf(node, {
    ...host.abilities,
    attach: host.abilities.attach && attachActionOf(host, node) !== null,
  });
  const more = moreItemsOf(host, node, actions.includes('chat'));
  if (actions.length === 0 && more.length === 0) return null;
  return (
    <View className="flex-row px-2 pb-3">
      {actions.map((action) => (
        <QuickButton
          key={action}
          spec={specOf(action, node)}
          active={action === 'star' && node.marks.starred}
          onPress={() => {
            run(action);
          }}
        />
      ))}
      {more.length === 0 ? null : <QuickMore items={more} name={node.name} />}
    </View>
  );
}

function PullUpHeader({
  node,
  links,
  close,
}: {
  readonly node: FileNode;
  readonly links: FileLinks;
  readonly close: () => void;
}): ReactNode {
  const caption = detailLineOf(node) === '' ? sizeTextOf(node) : detailLineOf(node);
  return (
    <View className="flex-row items-center gap-3 px-4 pb-3 pt-1">
      <View className="size-12 items-center justify-center overflow-hidden rounded-md bg-surface-3">
        {links.thumb === null || node.kind === 'folder' ? (
          <NodeGlyph node={node} icon={links.icon} />
        ) : (
          <Image
            source={{ uri: links.thumb }}
            recyclingKey={nodeKeyOf(node)}
            contentFit="cover"
            accessibilityLabel={node.name}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {node.name}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
          {caption}
        </Text>
      </View>
      <IconButton icon="close" label="Close details" onPress={close} />
    </View>
  );
}

export function ItemPullUp<O>(props: DetailsProps<O>): ReactNode {
  const { node, host } = props;
  const links = useSourceLinks(host.source, node);
  return (
    <BottomSheet open onClose={host.close} label={node.name} detents={PULL_UP_DETENTS} scroll>
      <PullUpHeader node={node} links={links} close={host.close} />
      <QuickRow {...props} links={links} />
      <DetailsTabs {...props} pane={false} />
    </BottomSheet>
  );
}
