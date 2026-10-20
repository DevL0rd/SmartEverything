import type { ReactNode } from 'react';
import type { ListeningView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { updateEarHost } from '../../../api/settings';
import { Card } from '../../../components/card';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useStoreSelector } from '../../../store/store-context';
import { earHostOf } from './ear-host-pref';
import { earHostHint, earHostOfValue, earHostOptions, earHostValue } from './ear-host-model';

export function EarHostCard({
  view,
  offline,
}: {
  readonly view: ListeningView;
  readonly offline: boolean;
}): ReactNode {
  const hostId = useStoreSelector(earHostOf);
  return (
    <Card title="Listens for cameras, walkie and Discord" icon="monitor">
      <Segmented
        label="Computer that listens for cameras, walkie channels and Discord"
        options={earHostOptions(view)}
        value={earHostValue(hostId)}
        disabled={offline}
        onChange={(value) => {
          background(updateEarHost(earHostOfValue(value)), 'listening.ear_host_failed');
        }}
      />
      <Text variant="footnote" tone="variant">
        {earHostHint(hostId, view)}
      </Text>
    </Card>
  );
}
