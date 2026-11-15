import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { DriveZipEntry, DriveZipTotals } from '@smarteverything/domain';
import { SegmentBar } from '../../../components/charts/segment-bar';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useScreenPaused } from '../../../design/screen-pause';
import { bytes } from '../../../format/number';
import type { FileNode, FileSource, ZipListing } from '../source/types';
import { useSourceZip } from '../source/source-hooks';
import { VIEW_ONLY_LINE, type ExportState } from './export-model';
import { ZipEntryView } from './zip-entry';
import {
  firstExpanded,
  packedLineOf,
  toggled,
  zipHeadlineOf,
  zipRowsOf,
  zipSegmentsOf,
  zipTreeOf,
} from './zip-model';
import { ZipEntryRow, type ZipRowHandlers } from './zip-row';

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'] as const;

function useWholeArchive(listing: ZipListing): void {
  const paused = useScreenPaused();
  const more = paused || listing.loading || listing.error !== null ? null : listing.more;
  useEffect(() => {
    if (more !== null) more();
  }, [more]);
}

function Summary({
  totals,
  entries,
  viewOnly,
}: {
  readonly totals: DriveZipTotals;
  readonly entries: readonly DriveZipEntry[];
  readonly viewOnly: boolean;
}): ReactNode {
  const segments = zipSegmentsOf(entries);
  const packed = packedLineOf(totals);
  return (
    <View className="gap-3 px-4 pb-3 pt-4">
      <View className="gap-0.5">
        <Text variant="body-strong" numberOfLines={2} className="tabular">
          {zipHeadlineOf(totals)}
        </Text>
        {packed === null ? null : (
          <Text variant="footnote" tone="variant" className="tabular">
            {packed}
          </Text>
        )}
      </View>
      {segments.length === 0 ? null : (
        <SegmentBar segments={segments} label="Unpacked size by kind" legend format={bytes} />
      )}
      {viewOnly ? (
        <Text variant="footnote" tone="variant">
          {VIEW_ONLY_LINE}
        </Text>
      ) : null}
    </View>
  );
}

function Footer({ more }: { readonly more: boolean }): ReactNode {
  if (!more) return <View className="h-2" />;
  return (
    <Text variant="footnote" tone="variant" className="px-4 py-3">
      Reading the rest of the archive…
    </Text>
  );
}

function useRows(entries: readonly DriveZipEntry[]): {
  readonly rows: ReturnType<typeof zipRowsOf>;
  readonly toggle: (path: string) => void;
} {
  const tree = useMemo(() => zipTreeOf(entries), [entries]);
  const [expanded, setExpanded] = useState<ReadonlySet<string> | null>(null);
  const shown = expanded ?? firstExpanded(tree);
  return {
    rows: zipRowsOf(tree, shown),
    toggle: (path): void => {
      setExpanded(toggled(shown, path));
    },
  };
}

function Archive({
  node,
  listing,
  exports,
  onOpen,
}: {
  readonly node: FileNode;
  readonly listing: ZipListing;
  readonly exports: ExportState;
  readonly onOpen: (entry: DriveZipEntry) => void;
}): ReactNode {
  const { rows, toggle } = useRows(listing.entries);
  const { totals } = listing;
  if (listing.entries.length === 0 && listing.more === null) {
    return (
      <EmptyState icon="box" title="This archive is empty" body="There are no files inside it." />
    );
  }
  const handlers: ZipRowHandlers = { node, listing, exports, onOpen, onToggle: toggle };
  return (
    <View className="min-h-0 w-full max-w-reading flex-1 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1">
      <FlashList
        data={rows}
        keyExtractor={(row) => row.node.path}
        ListHeaderComponent={
          totals === null ? null : (
            <Summary totals={totals} entries={listing.entries} viewOnly={exports.viewOnly} />
          )
        }
        ListFooterComponent={<Footer more={listing.more !== null} />}
        renderItem={({ item: row }) => <ZipEntryRow row={row} handlers={handlers} />}
      />
    </View>
  );
}

function Unloaded({ listing }: { readonly listing: ZipListing }): ReactNode {
  if (listing.error !== null) {
    return (
      <View className="w-full max-w-reading gap-3 p-4">
        <EmptyState
          icon="box"
          title="This archive could not be read"
          body="What is inside it could not be listed. It may be damaged or not a zip file."
        />
        <ErrorState error={listing.error} />
      </View>
    );
  }
  return (
    <View
      aria-busy
      accessibilityLabel="Reading the archive"
      className="w-full max-w-reading gap-2 p-4"
    >
      <Skeleton shape="block" className="h-24" />
      {SKELETON_ROWS.map((key) => (
        <Skeleton key={key} shape="block" className="h-row-h" />
      ))}
    </View>
  );
}

export function ZipPane<O>({
  node,
  source,
  exports,
}: {
  readonly node: FileNode<O>;
  readonly source: FileSource<O>;
  readonly exports: ExportState;
}): ReactNode {
  const listing = useSourceZip(source, node);
  const [opened, setOpened] = useState<DriveZipEntry | null>(null);
  useWholeArchive(listing);
  if (opened !== null) {
    return (
      <ZipEntryView
        node={node}
        listing={listing}
        entry={opened}
        exports={exports}
        onBack={() => {
          setOpened(null);
        }}
      />
    );
  }
  const read = listing.entries.length > 0 || (!listing.loading && listing.error === null);
  if (!read) return <Unloaded listing={listing} />;
  return (
    <View className="size-full min-h-0 items-center p-4">
      <Archive node={node} listing={listing} exports={exports} onOpen={setOpened} />
    </View>
  );
}
