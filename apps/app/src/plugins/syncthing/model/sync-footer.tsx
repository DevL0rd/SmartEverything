import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { duration } from '../../../format/time';

export function SyncFooter({ snapshot }: { readonly snapshot: SyncthingSnapshot }): ReactNode {
  const line = joinParts([
    snapshot.version === null ? null : `Syncthing ${snapshot.version}`,
    snapshot.uptimeSeconds === null ? null : `running for ${duration(snapshot.uptimeSeconds)}`,
  ]);
  return line === '' ? null : (
    <Text variant="footnote" tone="variant">
      {line}
    </Text>
  );
}
