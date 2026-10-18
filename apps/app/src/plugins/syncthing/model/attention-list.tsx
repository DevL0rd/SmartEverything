import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { attentionTarget } from './attention-model';

export function AttentionList({
  snapshot,
  deviceId,
}: {
  readonly snapshot: SyncthingSnapshot;
  readonly deviceId: string;
}): ReactNode {
  if (snapshot.attention.length === 0) {
    return null;
  }
  return (
    <List title="Needs attention" caption={String(snapshot.attention.length)}>
      {snapshot.attention.map((item) => {
        const target = attentionTarget(item, deviceId);
        return (
          <ListRow
            key={`${item.kind}:${item.folderId ?? ''}:${item.deviceId ?? ''}:${item.text}`}
            title={item.text}
            icon="warning"
            iconTone={item.kind === 'device_overdue' ? 'warning' : 'critical'}
            {...(target === null ? {} : { href: target, chevron: true })}
          />
        );
      })}
    </List>
  );
}
