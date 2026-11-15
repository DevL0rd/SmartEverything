import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import {
  VIEW_ONLY_LABEL,
  VIEW_ONLY_LINE,
  exportStateOf,
  lockedNoteOf,
  type ExportState,
} from '../quick-look/export-model';
import { downloadNode, openNode } from '../quick-look/node-files';
import type {
  FileLinks,
  FileNode,
  InfoRow,
  SourceActionSpec,
  SourceInfoSpec,
} from '../source/types';
import { useSourceInfo, useSourceLinks } from '../source/source-hooks';
import { previewableOf } from './details-model';
import type { DetailsProps } from './details-host';
import { InfoCard, InfoFact, InfoValue } from './info-facts';
import { PreviewPicture } from './preview-tab';

function Protection({
  node,
  exports,
  first,
}: {
  readonly node: FileNode;
  readonly exports: ExportState;
  readonly first: boolean;
}): ReactNode {
  const note = lockedNoteOf(node);
  if (exports.entry !== null) {
    return (
      <InfoFact label="Contents" first={first}>
        <Text variant="callout" className="min-w-0 flex-1 py-1">
          {exports.entry.stays}
        </Text>
      </InfoFact>
    );
  }
  if (!exports.viewOnly && note === null) return null;
  return (
    <InfoFact label="Protection" first={first}>
      <View className="min-w-0 flex-1 gap-1 py-1">
        <Badge label={VIEW_ONLY_LABEL} icon="eye" />
        <Text variant="footnote" tone="variant">
          {exports.viewOnly ? VIEW_ONLY_LINE : note}
        </Text>
      </View>
    </InfoFact>
  );
}

function Facts({
  node,
  rows,
  exports,
}: {
  readonly node: FileNode;
  readonly rows: readonly InfoRow[];
  readonly exports: ExportState;
}): ReactNode {
  if (
    rows.length === 0 &&
    exports.entry === null &&
    !exports.viewOnly &&
    lockedNoteOf(node) === null
  ) {
    return null;
  }
  return (
    <InfoCard>
      {rows.map((row, index) => (
        <InfoFact key={row.key} label={row.label} first={index === 0}>
          <InfoValue text={row.value} />
        </InfoFact>
      ))}
      <Protection node={node} exports={exports} first={rows.length === 0} />
    </InfoCard>
  );
}

function OpenButton({
  node,
  links,
}: {
  readonly node: FileNode;
  readonly links: FileLinks;
}): ReactNode {
  return (
    <Button
      label="Open"
      icon="externalLink"
      grow
      disabled={links.file === null}
      onPress={() => {
        openNode(node, links);
      }}
    />
  );
}

function DownloadButton({
  node,
  links,
}: {
  readonly node: FileNode;
  readonly links: FileLinks;
}): ReactNode {
  return (
    <Button
      label="Download"
      icon="download"
      variant="tonal"
      disabled={links.download === null}
      onPress={() => {
        downloadNode(node, links);
      }}
    />
  );
}

function MainActions({
  node,
  links,
  open,
  download,
}: {
  readonly node: FileNode;
  readonly links: FileLinks;
  readonly open: boolean;
  readonly download: boolean;
}): ReactNode {
  if (!open && !download) return null;
  return (
    <View className="flex-row gap-2">
      {open ? <OpenButton node={node} links={links} /> : null}
      {download ? <DownloadButton node={node} links={links} /> : null}
    </View>
  );
}

function ExtraActions<O>({
  node,
  extra,
}: {
  readonly node: FileNode<O>;
  readonly extra: readonly SourceActionSpec<O>[];
}): ReactNode {
  if (extra.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {extra.map((action) => (
        <Button
          key={action.id}
          label={action.label}
          icon={action.icon}
          variant="tonal"
          onPress={() => {
            action.run([node]);
          }}
        />
      ))}
    </View>
  );
}

function Actions<O>({
  node,
  links,
  exports,
  extra,
  pane,
}: {
  readonly node: FileNode<O>;
  readonly links: FileLinks;
  readonly exports: ExportState;
  readonly extra: readonly SourceActionSpec<O>[];
  readonly pane: boolean;
}): ReactNode {
  const open = pane && node.kind !== 'folder' && exports.mayOpen;
  const download = pane && exports.mayDownload;
  if (!open && !download && extra.length === 0) return null;
  return (
    <View className="gap-2">
      <MainActions node={node} links={links} open={open} download={download} />
      <ExtraActions node={node} extra={extra} />
    </View>
  );
}

function Sections<O>({
  node,
  sections,
}: {
  readonly node: FileNode<O>;
  readonly sections: readonly SourceInfoSpec<O>[];
}): ReactNode {
  return sections.map(({ id, Section }) => <Section key={`${node.key}:${id}`} node={node} />);
}

export function InfoTab<O>({
  node,
  host,
  pane,
}: DetailsProps<O> & { readonly pane: boolean }): ReactNode {
  const { source, abilities } = host;
  const links = useSourceLinks(source, node);
  const rows = useSourceInfo(source, node);
  const exports = exportStateOf(node, abilities);
  return (
    <View className="gap-4">
      {links.thumb !== null && previewableOf(node, links.thumb) ? (
        <PreviewPicture node={node} thumb={links.thumb} />
      ) : null}
      <Actions
        node={node}
        links={links}
        exports={exports}
        extra={source.actions([node])}
        pane={pane}
      />
      <Facts node={node} rows={rows} exports={exports} />
      <Sections node={node} sections={source.infoSections(node)} />
    </View>
  );
}
