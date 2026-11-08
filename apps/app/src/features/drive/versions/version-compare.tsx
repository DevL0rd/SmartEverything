import type { ReactNode } from 'react';
import { useEffect, useEffectEvent, useState } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { notifyFailure } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { saveFile } from '../../../platform/file-actions';
import { diffLanguage } from '../../../components/diff-language';
import {
  compareKindOf,
  diffTexts,
  imageSizeOf,
  readVersionText,
  type ComparedText,
  type VersionLinkSize,
} from './diff-model';
import { ImageCompare } from './image-compare';
import { TextDiff } from './text-diff';
import type { VersionEntry } from './versions-model';

const log = new Logger('app.drive');

export type VersionLink = (
  item: DriveItem,
  entry: VersionEntry,
  size: VersionLinkSize,
) => Promise<string | null>;

interface VersionPair<T> {
  readonly a: T;
  readonly b: T;
}

type Loaded<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: unknown; readonly retry: () => void }
  | { readonly state: 'ready'; readonly value: T };

class VersionLinkMissingError extends Error {
  override readonly name = 'VersionLinkMissingError';
}

async function linkOf(
  link: VersionLink,
  item: DriveItem,
  entry: VersionEntry,
  size: VersionLinkSize,
): Promise<string> {
  const url = await link(item, entry, size);
  if (url === null) throw new VersionLinkMissingError(`No link came back for ${item.name}.`);
  return url;
}

function pairLinks(
  link: VersionLink,
  item: DriveItem,
  pair: VersionPair<VersionEntry>,
  size: VersionLinkSize,
): Promise<VersionPair<string>> {
  return Promise.all([linkOf(link, item, pair.a, size), linkOf(link, item, pair.b, size)]).then(
    ([a, b]) => ({ a, b }),
  );
}

interface Settled<T> {
  readonly key: string;
  readonly value: Loaded<T>;
}

function useLoaded<T>(key: string, load: () => Promise<T>, failure: string): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const keyed = `${key}\n${String(attempt)}`;
  const start = useEffectEvent(load);
  useEffect(() => {
    let current = true;
    const retry = (): void => {
      setAttempt((value) => value + 1);
    };
    start().then(
      (value) => {
        if (current) setSettled({ key: keyed, value: { state: 'ready', value } });
      },
      (error: unknown) => {
        log.warn(failure, { reason: String(error) });
        if (current) setSettled({ key: keyed, value: { state: 'failed', error, retry } });
      },
    );
    return (): void => {
      current = false;
    };
  }, [keyed, failure]);
  return settled?.key === keyed ? settled.value : { state: 'loading' };
}

function pairKey(item: DriveItem, a: VersionEntry, b: VersionEntry): string {
  return `${item.id}\n${String(item.rev)}\n${a.key}\n${b.key}`;
}

function LoadedBody<T>({
  loaded,
  children,
}: {
  readonly loaded: Loaded<T>;
  readonly children: (value: T) => ReactNode;
}): ReactNode {
  if (loaded.state === 'loading') {
    return <Skeleton shape="block" className="min-h-48 flex-1 rounded-md" />;
  }
  if (loaded.state === 'failed') {
    return <ErrorState error={loaded.error} retry={loaded.retry} />;
  }
  return children(loaded.value);
}

function downloadBoth(link: VersionLink, item: DriveItem, a: VersionEntry, b: VersionEntry): void {
  pairLinks(link, item, { a, b }, 'file')
    .then(async (urls) => {
      await saveFile(urls.a);
      await saveFile(urls.b);
    })
    .catch(notifyFailure(`${item.name} could not be downloaded.`));
}

function DownloadBoth({ parts }: { readonly parts: VersionCompareProps }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const { item, a, b, link } = parts;
  return (
    <View className="flex-1 justify-center">
      <EmptyState
        compact
        icon="fileText"
        title="This kind of file can't be compared here"
        body="Download A and B to compare them in an app that opens this kind of file."
        action={
          <Button
            label="Download both"
            icon="download"
            variant="tonal"
            size={pointer ? 'md' : 'lg'}
            onPress={() => {
              downloadBoth(link, item, a, b);
            }}
          />
        }
      />
    </View>
  );
}

function Pictures({ parts }: { readonly parts: VersionCompareProps }): ReactNode {
  const { item, a, b, link } = parts;
  const size = imageSizeOf(item);
  const loaded = useLoaded(
    `${pairKey(item, a, b)}\n${size}`,
    () => pairLinks(link, item, { a, b }, size),
    'version_compare.image_links_failed',
  );
  return (
    <LoadedBody loaded={loaded}>
      {(urls) => <ImageCompare item={item} a={a} b={b} urls={urls} />}
    </LoadedBody>
  );
}

async function compareTexts(props: VersionCompareProps): Promise<ComparedText> {
  const { item, a, b, link } = props;
  const urls = await pairLinks(link, item, { a, b }, 'file');
  const read = (url: string, total: number): Promise<string> =>
    readVersionText(url, total, (target, init) => fetch(target, init));
  const [after, before] = await Promise.all([read(urls.a, a.bytes), read(urls.b, b.bytes)]);
  return {
    diff: await diffTexts(before, after),
    language: diffLanguage(item.name, after.split('\n', 1)[0] ?? ''),
  };
}

function Texts({ parts }: { readonly parts: VersionCompareProps }): ReactNode {
  const loaded = useLoaded(
    `${pairKey(parts.item, parts.a, parts.b)}\ntext`,
    () => compareTexts(parts),
    'version_compare.text_failed',
  );
  return <LoadedBody loaded={loaded}>{(compared) => <TextDiff compared={compared} />}</LoadedBody>;
}

export interface VersionCompareProps {
  readonly item: DriveItem;
  readonly a: VersionEntry;
  readonly b: VersionEntry;
  readonly link: VersionLink;
}

export function VersionCompare(props: VersionCompareProps): ReactNode {
  const kind = compareKindOf(props.item);
  if (kind === 'image') return <Pictures parts={props} />;
  if (kind === 'text') return <Texts parts={props} />;
  return <DownloadBoth parts={props} />;
}
