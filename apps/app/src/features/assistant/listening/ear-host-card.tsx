import type { ReactNode } from 'react';
import type { ListeningView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { updateEarHost } from '../../../api/settings';
import { Card } from '../../../components/card';
import { Select } from '../../../components/select';
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
  const value = earHostValue(hostId);
  return (
    <Card title="Listens for cameras, walkie and Discord" icon="monitor">
      <Select
        label="Listening computer"
        options={earHostOptions(view)}
        value={value}
        showLabel={false}
        disabled={offline}
        onChange={(next) => {
          if (next !== value) {
            background(updateEarHost(earHostOfValue(next)), 'listening.ear_host_failed');
          }
        }}
      />
      <Text variant="footnote" tone="variant">
        {earHostHint(hostId, view)}
      </Text>
    </Card>
  );
}
