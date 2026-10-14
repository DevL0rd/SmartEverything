import type { ReactNode } from 'react';
import type { HarnessExtensionItem } from '@smarteverything/domain';
import { Sheet } from '../../../components/sheet';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { CopyButton } from '../../../components/copy-button';
import { Text } from '../../../components/text';

export function ExtensionSourceSheet({
  item,
  open,
  onClose,
}: {
  readonly item: HarnessExtensionItem;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const selection = item.selection;
  const metadata = selection.kind === 'entry' ? selection.entry.metadata : selection.asset;
  const source = metadata?.source;
  const identity =
    source === undefined
      ? 'Source not reported'
      : source.kind === 'artifact'
        ? source.url
        : source.identity;
  const version = selection.kind === 'entry' ? selection.entry.version : selection.asset.version;
  const integrity = metadata?.integrity;
  return (
    <Sheet open={open} onClose={onClose} title="Source" detents={['half', 'full']}>
      <SourceHeader publisher={item.publisher} version={version} />
      <List inset>
        <ListRow
          title="Source"
          subtitle={identity}
          wrapSubtitle
          trailing={<CopyButton value={identity} label="Copy source" />}
        />
        {integrity === undefined ? null : (
          <ListRow
            title="Integrity"
            subtitle={integrity}
            wrapSubtitle
            trailing={<CopyButton value={integrity} label="Copy integrity" />}
          />
        )}
      </List>
      <Text variant="footnote" tone="variant">
        Shared updates replace approved official sources with verified pinned versions. Installing
        does not grant file, shell or account access.
      </Text>
    </Sheet>
  );
}

function SourceHeader({
  publisher,
  version,
}: {
  readonly publisher: string;
  readonly version: string;
}): ReactNode {
  return (
    <List inset>
      <ListRow title="Publisher" subtitle={publisher} wrapSubtitle />
      <ListRow
        title="Pinned version"
        subtitle={version}
        wrapSubtitle
        trailing={<CopyButton value={version} label="Copy version" />}
      />
    </List>
  );
}
