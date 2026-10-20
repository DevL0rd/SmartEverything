import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useNavEdits, type NavEdits } from '../../../app-shell/nav-edit-actions';
import { HiddenPages } from '../../../app-shell/nav-hidden-pages';
import type { NavNodeView } from '../../../app-shell/nav-model';
import { removalMenuItem, removalOf } from '../../../app-shell/nav-removal';
import { navShown } from '../../../app-shell/nav-sheet-state';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { ReorderableList } from '../../../components/reorderable-list';
import { Section } from '../../../components/section';
import { useValue } from '../../../design/external-store';
import { plural } from '../../../format/text';

function removal(node: NavNodeView, edits: NavEdits): MenuItem | null {
  const found = removalOf(node);
  return found === null ? null : removalMenuItem(found, node.key, edits);
}

function subtitleOf(node: NavNodeView): string | undefined {
  if (node.kind === 'folder') return plural(node.items.length, 'item');
  return node.missing ? 'Not found' : undefined;
}

function NodeRow({
  node,
  edits,
}: {
  readonly node: NavNodeView;
  readonly edits: NavEdits;
}): ReactNode {
  const item = removal(node, edits);
  const subtitle = subtitleOf(node);
  return (
    <ListRow
      title={node.title}
      icon={node.icon}
      {...(subtitle === undefined ? {} : { subtitle })}
      trailing={
        <View className="flex-row items-center">
          <Icon name="grip" tone="faint" />
          {item === null ? null : <OverflowButton items={[item]} label={`${node.title} actions`} />}
        </View>
      }
    />
  );
}

export function NavigationOrder(): ReactNode {
  const model = useValue(navShown);
  const edits = useNavEdits();
  if (model === null) return null;
  return (
    <Section footer="Drag to reorder. The first four items fill the bar on a phone.">
      <ReorderableList
        items={model.nodes}
        keyOf={(node) => node.key}
        labelOf={(node) => node.title}
        renderItem={(node) => <NodeRow node={node} edits={edits} />}
        onReorder={edits.move}
      />
    </Section>
  );
}

export function HiddenNavigationPages(): ReactNode {
  const model = useValue(navShown);
  if (model === null) return null;
  return (
    <Section>
      <HiddenPages hidden={model.hidden} title={null} />
    </Section>
  );
}
