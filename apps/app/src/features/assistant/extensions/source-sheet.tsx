import type { ReactNode } from 'react';
import type { HarnessExtensionItem } from '@smarteverything/domain';
import { Sheet } from '../../../components/sheet';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { CopyButton } from '../../../components/copy-button';
import { Text } from '../../../components/text';

function sourceIdentity(source: HarnessExtensionItem['source']): string {
  switch (source.kind) {
    case 'git':
      return source.url;
    case 'included':
      return 'Included with SmartEverything';
    case 'editor':
      return 'Written in the app';
  }
}

export function ExtensionSourceSheet({
  item,
  open,
  onClose,
}: {
  readonly item: HarnessExtensionItem;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const identity = sourceIdentity(item.source);
  const commit = item.source.kind === 'git' ? item.source.commit : null;
  return (
    <Sheet open={open} onClose={onClose} title="Source" detents={['half', 'full']}>
      <SourceHeader publisher={item.publisher} version={item.version} />
      <List inset>
        <ListRow
          title="Source"
          subtitle={identity}
          wrapSubtitle
          trailing={<CopyButton value={identity} label="Copy source" />}
        />
        {commit === null ? null : (
          <ListRow
            title="Commit"
            subtitle={commit}
            wrapSubtitle
            trailing={<CopyButton value={commit} label="Copy commit" />}
          />
        )}
      </List>
      <Text variant="footnote" tone="variant">
        Automatic updates fetch the newest version from the source.
      </Text>
    </Sheet>
  );
}

function SourceHeader({
  publisher,
  version,
}: {
  readonly publisher: string;
  readonly version: string | null;
}): ReactNode {
  return (
    <List inset>
      <ListRow title="Publisher" subtitle={publisher} wrapSubtitle />
      {version === null ? null : (
        <ListRow
          title="Version"
          subtitle={version}
          wrapSubtitle
          trailing={<CopyButton value={version} label="Copy version" />}
        />
      )}
    </List>
  );
}
