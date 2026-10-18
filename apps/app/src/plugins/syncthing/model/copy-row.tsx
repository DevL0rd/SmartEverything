import type { ReactNode } from 'react';
import { CopyButton } from '../../../components/copy-button';
import { ListRow } from '../../../components/list-row';

export function CopyRow({
  title,
  value,
}: {
  readonly title: string;
  readonly value: string;
}): ReactNode {
  return (
    <ListRow
      title={title}
      subtitle={value}
      wrapSubtitle
      trailing={<CopyButton value={value} label={`Copy ${title.toLowerCase()}`} what={title} />}
    />
  );
}
