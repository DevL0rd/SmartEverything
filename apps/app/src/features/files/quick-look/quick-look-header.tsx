import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { joinParts } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { NodeGlyph } from '../details/node-glyph';
import type { FileLinks, FileNode } from '../source/types';
import { VIEW_ONLY_LABEL, type ExportState } from './export-model';
import { downloadNode, openNode } from './node-files';
import { quickLookCaption } from './quick-look-model';

export interface QuickLookHeaderProps {
  readonly node: FileNode;
  readonly links: FileLinks;
  readonly exports: ExportState;
  readonly position: string | null;
  readonly touch: boolean;
  readonly onDetails: (() => void) | null;
  readonly onClose: () => void;
}

function FileActions({
  node,
  links,
  exports,
  touch,
  onDetails,
}: Omit<QuickLookHeaderProps, 'position' | 'onClose'>): ReactNode {
  if (node.kind === 'folder') return null;
  return (
    <>
      {onDetails === null ? null : (
        <IconButton icon="panelRight" label="Details" shortcut="I" onPress={onDetails} />
      )}
      {exports.mayDownload ? (
        <IconButton
          icon="download"
          label={`Download ${node.name}`}
          disabled={links.download === null}
          onPress={() => {
            downloadNode(node, links);
          }}
        />
      ) : null}
      {touch || !exports.mayOpen ? null : (
        <Button
          label="Open"
          icon="externalLink"
          variant="tonal"
          disabled={links.file === null}
          onPress={() => {
            openNode(node, links);
          }}
        />
      )}
    </>
  );
}

export function QuickLookHeader({ position, onClose, ...props }: QuickLookHeaderProps): ReactNode {
  const now = useMinute();
  const { node, links, exports, touch } = props;
  return (
    <View
      className={cn(
        'flex-row items-center gap-3 border-b border-outline-variant',
        touch ? 'min-h-16 px-2' : 'min-h-14 pl-4 pr-3',
      )}
    >
      {touch ? <IconButton icon="chevronLeft" label="Close quick look" onPress={onClose} /> : null}
      <NodeGlyph node={node} icon={links.icon} well="s" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {node.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {joinParts([
            quickLookCaption(node, now),
            touch && exports.viewOnly ? VIEW_ONLY_LABEL : null,
          ])}
        </Text>
      </View>
      {exports.viewOnly && !touch ? <Badge label={VIEW_ONLY_LABEL} icon="eye" /> : null}
      {position === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {position}
        </Text>
      )}
      <FileActions {...props} />
      {touch ? null : (
        <IconButton icon="x" label="Close quick look" shortcut="Space" onPress={onClose} />
      )}
    </View>
  );
}
