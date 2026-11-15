import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { DriveZipEntry } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { IconButton } from '../../../components/icon-button';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { bytes } from '../../../format/number';
import { downloadFile, previewFile } from '../../../platform/file-actions';
import type { FileNode, ZipListing } from '../source/types';
import { VIEW_ONLY_LINE, type ExportState } from './export-model';
import { MediaPlayer } from './media-player';
import { nodeKeyOf } from './node-files';
import { PictureAt, TextLines } from './players';
import { TEXT_HEAD_BYTES, useTextHead } from './text-head';
import { zipOpenOf, type ZipOpen } from './zip-model';

const log = new Logger('app.files');

export function downloadEntry(listing: ZipListing, entry: DriveZipEntry): void {
  listing
    .entryLink(entry.index)
    .then((url) => {
      downloadFile(url, entry.name);
    })
    .catch(notifyFailure(`${entry.name} could not be downloaded.`));
}

type EntryLink =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: unknown }
  | { readonly state: 'ready'; readonly url: string };

interface Settled {
  readonly key: string;
  readonly link: EntryLink;
}

function useEntryLink(listing: ZipListing, entry: DriveZipEntry, key: string): EntryLink {
  const [settled, setSettled] = useState<Settled | null>(null);
  const { entryLink } = listing;
  const { index } = entry;
  useEffect(() => {
    let current = true;
    entryLink(index)
      .then((url) => {
        if (current) setSettled({ key, link: { state: 'ready', url } });
      })
      .catch((error: unknown) => {
        log.warn('quick_look.zip_entry_link_failed', { reason: String(error) });
        if (current) setSettled({ key, link: { state: 'failed', error } });
      });
    return (): void => {
      current = false;
    };
  }, [entryLink, index, key]);
  return settled?.key === key ? settled.link : { state: 'loading' };
}

interface EntryProps {
  readonly node: FileNode;
  readonly listing: ZipListing;
  readonly entry: DriveZipEntry;
  readonly exports: ExportState;
}

function entryKeyOf({ node, entry }: Pick<EntryProps, 'node' | 'entry'>): string {
  return `${nodeKeyOf(node)}:${String(entry.index)}:${entry.path}`;
}

function EntryText({
  url,
  entry,
  exports,
  textKey,
}: Pick<EntryProps, 'entry' | 'exports'> & {
  readonly url: string;
  readonly textKey: string;
}): ReactNode {
  const head = useTextHead(url, entry.bytes, textKey, TEXT_HEAD_BYTES);
  if (head.state === 'loading') return <Skeleton shape="block" className="size-full" />;
  if (head.state === 'failed') {
    return (
      <EmptyState
        icon="fileText"
        title={entry.name}
        body="The start of this file could not be read out of the archive."
      />
    );
  }
  return <TextLines head={head.head} total={entry.bytes} selectable={exports.selectable} />;
}

function NoQuickLook({ listing, entry, exports }: EntryProps): ReactNode {
  return (
    <EmptyState
      icon="fileText"
      title={entry.name}
      body={
        exports.mayDownload
          ? 'There is no quick look for this kind of file. Download it to open it.'
          : VIEW_ONLY_LINE
      }
      {...(exports.mayDownload
        ? {
            action: (
              <Button
                label="Download"
                icon="download"
                variant="tonal"
                onPress={() => {
                  downloadEntry(listing, entry);
                }}
              />
            ),
          }
        : {})}
    />
  );
}

function Shown({
  open,
  url,
  ...props
}: EntryProps & {
  readonly open: Exclude<ZipOpen, 'locked' | 'none'>;
  readonly url: string;
}): ReactNode {
  const { entry, exports } = props;
  const key = entryKeyOf(props);
  switch (open) {
    case 'image':
      return <PictureAt uri={url} placeholder={null} recyclingKey={key} label={entry.name} />;
    case 'video':
    case 'audio':
      return (
        <MediaPlayer
          kind={open}
          url={url}
          poster={null}
          label={entry.name}
          viewOnly={exports.viewOnly}
          onOpen={() => {
            previewFile(url, entry.name);
          }}
        />
      );
    case 'text':
      return <EntryText url={url} entry={entry} exports={exports} textKey={key} />;
  }
}

function Linked({
  open,
  ...props
}: EntryProps & { readonly open: Exclude<ZipOpen, 'locked' | 'none'> }): ReactNode {
  const link = useEntryLink(props.listing, props.entry, entryKeyOf(props));
  if (link.state === 'failed') return <ErrorState error={link.error} />;
  if (link.state === 'loading') return <Skeleton shape="block" className="size-full" />;
  return <Shown open={open} url={link.url} {...props} />;
}

function EntryBody(props: EntryProps): ReactNode {
  const open = zipOpenOf(props.entry);
  if (open === 'locked') {
    return (
      <EmptyState
        icon="lock"
        title="Password protected"
        body="This file is locked with a password inside the archive, so it cannot be opened here."
      />
    );
  }
  if (open === 'none') return <NoQuickLook {...props} />;
  return <Linked open={open} {...props} />;
}

export function ZipEntryView({
  onBack,
  ...props
}: EntryProps & { readonly onBack: () => void }): ReactNode {
  const { node, listing, entry, exports } = props;
  const downloadable = exports.mayDownload && !entry.encrypted;
  return (
    <View className="size-full min-h-0 gap-2">
      <View className="flex-row items-center gap-2 px-2">
        <IconButton icon="arrowLeft" label="Back to the archive" onPress={onBack} />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={1}>
            {entry.name}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {`In ${node.name} · ${bytes(entry.bytes)}`}
          </Text>
        </View>
        {downloadable ? (
          <IconButton
            icon="download"
            label={`Download ${entry.name}`}
            onPress={() => {
              downloadEntry(listing, entry);
            }}
          />
        ) : null}
      </View>
      <View className="min-h-0 flex-1 items-center justify-center">
        <EntryBody {...props} />
      </View>
    </View>
  );
}
