import type { ReactNode } from 'react';
import type { IconName } from '../../components/icon';
import type { WideClass } from '../../features/devices';
import { useIsOwner } from '../../store/selectors';
import type { Device } from '../../store/state';
import { SetUpButton } from './cell-parts';
import { PendingCell } from './pending-cell';
import type { PluginStream } from './use-plugin-stream';
import { usePluginOff } from './use-plugin-off';

export interface CellCopy {
  readonly subject: string;
  readonly off: string;
  readonly waiting: string;
  readonly notSetUp: string;
}

export function CellGate<T extends { readonly connection: { readonly state: string } }>({
  device,
  cls,
  pluginId,
  glyph,
  copy,
  stream,
  children,
}: {
  readonly device: Device;
  readonly cls: WideClass;
  readonly pluginId: string;
  readonly glyph: IconName;
  readonly copy: CellCopy;
  readonly stream: PluginStream<T>;
  readonly children: (snapshot: T) => ReactNode;
}): ReactNode {
  const off = usePluginOff(pluginId);
  const owner = useIsOwner();
  const pending = (line: string, action: ReactNode): ReactNode => (
    <PendingCell
      device={device}
      cls={cls}
      glyph={glyph}
      subject={copy.subject}
      line={line}
      action={action}
    />
  );
  if (off) {
    return pending(copy.off, null);
  }
  if (stream.state !== 'ready') {
    return pending(copy.waiting, null);
  }
  if (stream.value.connection.state === 'not_set_up') {
    return pending(copy.notSetUp, owner ? <SetUpButton key="setup" pluginId={pluginId} /> : null);
  }
  return children(stream.value);
}
