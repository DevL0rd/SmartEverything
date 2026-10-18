import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import type { Device } from '../../../store/state';
import { useHubView } from './use-hub-view';

export function GatewayChildren({ device }: { readonly device: Device }): ReactNode {
  const view = useHubView(device.id);
  if (view.children.length === 0) {
    return null;
  }
  return (
    <Card title="Connected devices" icon="bluetooth" padding="none">
      {view.children.map((child) => (
        <ListRow
          key={child.id}
          title={child.name}
          subtitle={child.online ? 'Online' : 'Offline'}
          subtitleTone={child.online ? 'positive' : 'variant'}
          icon={child.button ? 'circle' : 'dot'}
          href={href.device(child)}
          chevron
        />
      ))}
    </Card>
  );
}
