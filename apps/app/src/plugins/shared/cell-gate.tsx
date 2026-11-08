import type { ReactNode } from 'react';
import type { IconName } from '../../components/icon';
import type { WideClass } from '../../features/devices';
import { selectIsOwner } from '../../store/selectors';
import type { Device, StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';
import { SetUpButton } from './cell-parts';
import { PendingCell } from './pending-cell';
import type { PluginStream } from './use-plugin-stream';
import { pluginOffIn } from './use-plugin-off';

export interface CellCopy {
  readonly subject: string;
  readonly off: string;
  readonly waiting: string;
  readonly notSetUp: string;
}

export type CellAccess = 'off' | 'owner' | 'member';

export function cellAccessOf(state: StoreState, pluginId: string): CellAccess {
  if (pluginOffIn(state, pluginId)) {
    return 'off';
  }
  return selectIsOwner(state) ? 'owner' : 'member';
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
  readonly children: (snapshot: T, owner: boolean) => ReactNode;
}): ReactNode {
  const access = useStoreSelector((state) => cellAccessOf(state, pluginId), Object.is, [pluginId]);
  const owner = access === 'owner';
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
  if (access === 'off') {
    return pending(copy.off, null);
  }
  if (stream.state !== 'ready') {
    return pending(copy.waiting, null);
  }
  if (stream.value.connection.state === 'not_set_up') {
    return pending(
      copy.notSetUp,
      owner ? <SetUpButton key="setup" pluginId={pluginId} cls={cls} /> : null,
    );
  }
  return children(stream.value, owner);
}
