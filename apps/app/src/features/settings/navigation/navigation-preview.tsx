import type { ReactNode } from 'react';
import { View } from 'react-native';
import { NAV_BAR_SLOTS } from '@smarteverything/domain';
import { navShown } from '../../../app-shell/nav-sheet-state';
import type { NavNodeView } from '../../../app-shell/nav-model';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useValue } from '../../../design/external-store';
import { useSizeClass } from '../../../design/size-class';
import { plural } from '../../../format/text';

const SIDEBAR_ROWS = 8;

function Slot({ node }: { readonly node: NavNodeView }): ReactNode {
  return (
    <View className="min-w-0 flex-1 items-center gap-0.5 py-1">
      <Icon name={node.icon} size={20} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {node.kind === 'folder' ? node.title : node.shortTitle}
      </Text>
    </View>
  );
}

function BarPreview({ nodes }: { readonly nodes: readonly NavNodeView[] }): ReactNode {
  const half = NAV_BAR_SLOTS / 2;
  return (
    <View className="flex-row items-center rounded-xl bg-chrome px-2 py-1">
      {nodes.slice(0, half).map((node) => (
        <Slot key={node.key} node={node} />
      ))}
      <View className="mx-2 h-9 w-16 items-center justify-center rounded-full bg-primary">
        <Icon name="sparkles" size={20} tone="onPrimary" />
      </View>
      {nodes.slice(half, NAV_BAR_SLOTS).map((node) => (
        <Slot key={node.key} node={node} />
      ))}
    </View>
  );
}

function SidebarRow({
  node,
  indent,
}: {
  readonly node: NavNodeView;
  readonly indent: boolean;
}): ReactNode {
  return (
    <View className={indent ? 'flex-row items-center gap-2 pl-6' : 'flex-row items-center gap-2'}>
      <Icon name={node.icon} size={16} tone="variant" />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {node.title}
      </Text>
    </View>
  );
}

function SidebarPreview({ nodes }: { readonly nodes: readonly NavNodeView[] }): ReactNode {
  const rows = nodes.flatMap((node) => [
    { node, indent: false },
    ...(node.kind === 'folder' ? node.items.map((entry) => ({ node: entry, indent: true })) : []),
  ]);
  return (
    <View className="gap-2 rounded-xl bg-chrome p-3">
      {rows.slice(0, SIDEBAR_ROWS).map(({ node, indent }) => (
        <SidebarRow key={node.key} node={node} indent={indent} />
      ))}
      {rows.length > SIDEBAR_ROWS ? (
        <Text variant="caption" tone="variant">
          {`and ${String(rows.length - SIDEBAR_ROWS)} more`}
        </Text>
      ) : null}
    </View>
  );
}

export function NavigationPreview(): ReactNode {
  const { nav } = useSizeClass();
  const model = useValue(navShown);
  if (model === null) return null;
  return (
    <Card title="Preview" icon="panelLeft">
      <View className="gap-3">
        {nav === 'bar' ? <BarPreview nodes={model.bar} /> : <SidebarPreview nodes={model.nodes} />}
        {nav === 'bar' && model.overflow.length > 0 ? (
          <Text variant="footnote" tone="variant">
            {`${plural(model.overflow.length, 'more item')} in the sheet`}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
