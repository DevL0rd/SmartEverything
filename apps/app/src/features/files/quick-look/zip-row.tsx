import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveZipEntry } from '@smarteverything/domain';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { FileGlyph } from '../../../components/files/file-glyph';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { FileNode, ZipListing } from '../source/types';
import type { ExportState } from './export-model';
import { downloadEntry } from './zip-entry';
import { zipRowCaptionOf, type ZipNode, type ZipRow } from './zip-model';

const INDENT = 16;

const CHEVRON_WIDTH = 12;

export interface ZipRowHandlers {
  readonly node: FileNode;
  readonly listing: ZipListing;
  readonly exports: ExportState;
  readonly onToggle: (path: string) => void;
  readonly onOpen: (entry: DriveZipEntry) => void;
}

function rowLabelOf(row: ZipRow): string {
  if (row.node.folder) return `${row.open ? 'Close' : 'Open'} folder ${row.node.name}`;
  return `Open ${row.node.name}`;
}

function Lead({ row }: { readonly row: ZipRow }): ReactNode {
  const indent = { width: CHEVRON_WIDTH + row.depth * INDENT } as const;
  return (
    <View style={indent} className="items-end">
      {row.node.folder ? (
        <Icon name={row.open ? 'chevronDown' : 'chevronRight'} size={16} tone="variant" />
      ) : null}
    </View>
  );
}

function Name({ node, share }: { readonly node: ZipNode; readonly share: number }): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-2">
        <Text variant="callout" numberOfLines={1} className="min-w-0 shrink">
          {node.name}
        </Text>
        {node.entry?.encrypted === true ? <Icon name="lock" size={16} tone="variant" /> : null}
      </View>
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <ProgressBar
            progress={share}
            colour="primary"
            label={`Size of ${node.name}`}
            ticking={false}
          />
        </View>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {zipRowCaptionOf(node)}
        </Text>
      </View>
    </View>
  );
}

function downloadableOf(node: ZipNode, exports: ExportState): DriveZipEntry | null {
  const entry = node.entry;
  if (!exports.mayDownload || node.folder || entry === null || entry.encrypted) return null;
  return entry;
}

export function ZipEntryRow({
  row,
  handlers,
}: {
  readonly row: ZipRow;
  readonly handlers: ZipRowHandlers;
}): ReactNode {
  const { node } = row;
  const downloadable = downloadableOf(node, handlers.exports);
  return (
    <View className="flex-row items-center gap-1 border-t border-outline-variant pr-2">
      <Interactive
        role="button"
        label={rowLabelOf(row)}
        {...(node.folder ? { expanded: row.open } : {})}
        onPress={() => {
          if (node.folder) handlers.onToggle(node.path);
          else if (node.entry !== null) handlers.onOpen(node.entry);
        }}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3 py-2 pr-2"
      >
        <Lead row={row} />
        <FileGlyph kind={node.folder ? 'folder' : 'file'} name={node.name} />
        <Name node={node} share={row.share} />
      </Interactive>
      {downloadable === null ? null : (
        <IconButton
          icon="download"
          label={`Download ${node.name}`}
          onPress={() => {
            downloadEntry(handlers.listing, downloadable);
          }}
        />
      )}
    </View>
  );
}
