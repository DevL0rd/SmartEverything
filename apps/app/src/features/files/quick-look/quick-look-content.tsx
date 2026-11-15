import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { itemsLine } from '../source/node';
import type { FileLinks, FileNode, FileSource } from '../source/types';
import { KIND_ICON } from '../browser/node-glyph';
import { VIEW_ONLY_LINE, entryTextOf, type ExportState } from './export-model';
import { MediaPlayer } from './media-player';
import { nodeKeyOf, openNode } from './node-files';
import { PictureAt, TextLines } from './players';
import { showsImageFile, type QuickLookContent as Content } from './quick-look-model';
import { TEXT_HEAD_BYTES, useTextHead } from './text-head';
import { ZipPane } from './zip-pane';

interface ShownProps {
  readonly node: FileNode;
  readonly links: FileLinks;
  readonly exports: ExportState;
}

function Picture({ node, links }: ShownProps): ReactNode {
  const [zoomed, setZoomed] = useState(false);
  const original = showsImageFile(node) && (zoomed || links.thumb === null) ? links.file : null;
  return (
    <PictureAt
      uri={original ?? links.thumb}
      placeholder={original === null ? null : links.thumb}
      recyclingKey={nodeKeyOf(node)}
      label={node.name}
      onZoomed={setZoomed}
    />
  );
}

function Media({
  node,
  links,
  exports,
  kind,
}: ShownProps & { readonly kind: 'video' | 'audio' }): ReactNode {
  if (links.file === null) return <Skeleton shape="block" className="size-full" />;
  return (
    <MediaPlayer
      kind={kind}
      url={links.file}
      poster={links.thumb}
      label={node.name}
      viewOnly={exports.viewOnly}
      onOpen={() => {
        openNode(node, links);
      }}
    />
  );
}

function unshownBodyOf(exports: ExportState, body: string): string {
  if (exports.entry !== null) return entryTextOf(exports.entry);
  return exports.viewOnly ? VIEW_ONLY_LINE : body;
}

function Unshown({
  node,
  links,
  exports,
  body,
}: ShownProps & { readonly body: string }): ReactNode {
  return (
    <EmptyState
      icon={KIND_ICON[node.kind]}
      title={node.name}
      body={unshownBodyOf(exports, body)}
      {...(!exports.mayOpen || links.file === null
        ? {}
        : {
            action: (
              <Button
                label="Open"
                icon="externalLink"
                variant="tonal"
                onPress={() => {
                  openNode(node, links);
                }}
              />
            ),
          })}
    />
  );
}

function TextBody(props: ShownProps): ReactNode {
  const { node, links, exports } = props;
  const total = node.size ?? 0;
  const head = useTextHead(links.file, total, nodeKeyOf(node), TEXT_HEAD_BYTES);
  if (head.state === 'loading') return <Skeleton shape="block" className="size-full" />;
  if (head.state === 'failed') {
    return <Unshown {...props} body="The start of this file could not be read. Open it instead." />;
  }
  return <TextLines head={head.head} total={total} selectable={exports.selectable} />;
}

function FolderBody({ node }: { readonly node: FileNode }): ReactNode {
  const body = joinParts([
    node.childCount === null ? null : itemsLine(node.childCount),
    node.size === null ? null : bytes(node.size),
  ]);
  return <EmptyState icon="folder" title={node.name} body={body} />;
}

export function QuickLookContent<O>({
  content,
  source,
  ...props
}: ShownProps & {
  readonly node: FileNode<O>;
  readonly content: Content;
  readonly source: FileSource<O>;
}): ReactNode {
  switch (content) {
    case 'folder':
      return <FolderBody node={props.node} />;
    case 'image':
    case 'picture':
      return <Picture {...props} />;
    case 'video':
    case 'audio':
      return <Media {...props} kind={content} />;
    case 'text':
      return <TextBody {...props} />;
    case 'zip':
      return <ZipPane node={props.node} source={source} exports={props.exports} />;
    case 'none':
      return (
        <Unshown
          {...props}
          body="There is no quick look for this kind of file. Open it or download it."
        />
      );
  }
}
