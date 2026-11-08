import type { CSSProperties, ReactNode } from 'react';
import { use, useCallback, useSyncExternalStore } from 'react';
import type { AutomationPluginKindRow, PluginRow } from '@smarteverything/domain';
import { Badge } from '../../../../../components/badge';
import type { EntityStore } from '../../../../../store/entity-store';
import { StoreContext } from '../../../../../store/store-runtime';

export type PluginState = Pick<PluginRow, 'enabled' | 'status'>;

const WATCHED = ['tables.automation_plugin_kinds', 'tables.plugins'];

function ownerName(row: AutomationPluginKindRow): string {
  return row.declaration.origin?.name ?? row.owner.slice(row.owner.indexOf(':') + 1);
}

function pluginIdOf(row: AutomationPluginKindRow): string | null {
  const origin = row.declaration.origin;
  return origin?.kind === 'plugin' ? origin.id : null;
}

function runningNotice(name: string, plugin: PluginState): string | null {
  if (!plugin.enabled) return `${name} is switched off`;
  if (plugin.status === 'crashed') return `${name} stopped working`;
  return plugin.status === 'needs_auth' ? `${name} needs signing in again` : null;
}

function kindNotice(name: string, row: AutomationPluginKindRow, installed: boolean): string | null {
  if (row.status === 'retired') {
    return installed ? `${name} no longer has this step` : `${name} is not installed`;
  }
  if (row.status === 'off')
    return installed ? `${name} is not reachable` : `${name} is switched off`;
  return null;
}

export function pluginNotice(
  row: AutomationPluginKindRow | undefined,
  plugin: PluginState | undefined,
): string | null {
  if (row === undefined) return null;
  const name = ownerName(row);
  const running = plugin === undefined ? null : runningNotice(name, plugin);
  return running ?? kindNotice(name, row, plugin !== undefined);
}

export function storeNotice(store: EntityStore, kindId: string): string | null {
  const { tables } = store.get();
  const row = tables.automation_plugin_kinds.byId[kindId];
  if (row === undefined) return null;
  const pluginId = pluginIdOf(row);
  return pluginNotice(row, pluginId === null ? undefined : tables.plugins.byId[pluginId]);
}

const NO_STORE = (): (() => void) => () => undefined;

export function usePluginNotice(kindId: string): string | null {
  const runtime = use(StoreContext);
  const store = runtime?.store ?? null;
  const subscribe = useCallback(
    (wake: () => void) => (store === null ? NO_STORE() : store.subscribeSlices(WATCHED, wake)),
    [store],
  );
  const read = (): string | null => (store === null ? null : storeNotice(store, kindId));
  return useSyncExternalStore(subscribe, read, read);
}

const CARD_BADGE: CSSProperties = {
  position: 'absolute',
  left: 0,
  bottom: '100%',
  marginBottom: 6,
  maxWidth: '100%',
  padding: '2px 10px',
  borderRadius: 999,
  border: '1px solid var(--se-critical)',
  background: 'var(--se-surface-2)',
  color: 'var(--se-on-surface)',
  font: '500 12px/18px var(--se-font, inherit)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  pointerEvents: 'none',
};

export function PluginCardBadge({ kindId }: { readonly kindId: string }): ReactNode {
  const notice = usePluginNotice(kindId);
  if (notice === null) return null;
  return (
    <div role="status" className="gc-plugin-badge" style={CARD_BADGE}>
      {notice}
    </div>
  );
}

export function PluginBadge({ notice }: { readonly notice: string }): ReactNode {
  return <Badge label={notice} tone="warning" icon="plug" />;
}
