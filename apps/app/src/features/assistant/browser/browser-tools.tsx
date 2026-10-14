import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { useValue } from '../../../design/external-store';
import { BrowserOverlayOwner, browserCovered } from '../../../platform/browser-overlays';
import { rememberBrowserFocus, restoreBrowserFocus } from '../../../platform/browser-focus';
import type { BrowserHandle } from '../../../platform/browser-contract';
import type {
  PreviewDiagnostics,
  PreviewDiagnosticsSnapshot,
} from './browser-diagnostics-contract';
import { useBrowserTools, toolSupport, type PreviewTool } from './browser-tools-actions';
import { useBrowserActionScope } from './browser-action-scope';
import { useRequestedBrowserAction } from './browser-requested-action';
export function BrowserTools({
  controller,
  snapshot,
  controls,
  address,
  ready,
  tabActions,
}: {
  readonly controller: PreviewDiagnostics;
  readonly snapshot: PreviewDiagnosticsSnapshot;
  readonly controls: BrowserHandle;
  readonly address: string | null;
  readonly ready: boolean;
  readonly tabActions: readonly MenuItem[];
}): ReactNode {
  const active = useBrowserActionScope();
  const [menuOwner] = useState(() => Symbol('browser-options'));
  const tools = useBrowserTools({ controller, snapshot, controls, address, ready });
  const covered = useValue(browserCovered);
  useEffect(() => {
    if (active && !covered) restoreBrowserFocus('tools');
  }, [active, covered]);
  const { ref, open, menu } = useAnchoredMenu(
    [...toolItems(tools, snapshot, address, { ready, menuOwner }), ...tabActions],
    'Browser options',
  );
  const show = (): void => {
    rememberBrowserFocus('tools');
    open();
  };
  useRequestedBrowserAction({ ...tools.handlers, menu: show });
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon="ellipsisVertical" label="Browser options" onPress={show} />
      <BrowserOverlayOwner value={menuOwner}>{menu}</BrowserOverlayOwner>
    </View>
  );
}
function toolItems(
  tools: ReturnType<typeof useBrowserTools>,
  snapshot: PreviewDiagnosticsSnapshot,
  address: string | null,
  context: { readonly ready: boolean; readonly menuOwner: symbol },
): readonly MenuItem[] {
  const { ready, menuOwner } = context;
  return [
    {
      label: 'Reload',
      icon: 'refresh',
      disabled: !ready,
      onPress: (): void => {
        tools.handlers.reload();
      },
    },
    toolItem(
      { tool: 'capture', label: 'Capture preview', icon: 'camera' },
      { tools, snapshot, ready, menuOwner },
    ),
    {
      label: 'Copy address',
      icon: 'copy',
      disabled: address === null,
      ...(address === null ? { description: 'This preview has no copyable website address.' } : {}),
      onPress: (): void => {
        tools.handlers.copy();
      },
    },
    toolItem(
      { tool: 'clear-cache', label: 'Clear cache', icon: 'trash' },
      { tools, snapshot, ready, menuOwner },
    ),
    toolItem(
      { tool: 'clear-storage', label: 'Clear website data', icon: 'trash' },
      { tools, snapshot, ready, menuOwner },
    ),
    toolItem(
      { tool: 'clear-cookies', label: 'Clear cookies', icon: 'cookie' },
      { tools, snapshot, ready, menuOwner },
    ),
  ];
}
function toolItem(
  {
    tool,
    label,
    icon,
  }: { readonly tool: PreviewTool; readonly label: string; readonly icon: MenuItem['icon'] },
  {
    tools,
    snapshot,
    ready,
    menuOwner,
  }: {
    readonly tools: ReturnType<typeof useBrowserTools>;
    readonly snapshot: PreviewDiagnosticsSnapshot;
    readonly ready: boolean;
    readonly menuOwner: symbol;
  },
): MenuItem {
  const support = toolSupport(snapshot, tool);
  return {
    label: tool === 'capture' && tools.pending === 'capture' ? 'Capturing preview…' : label,
    ...(icon === undefined ? {} : { icon }),
    disabled: !ready || tools.pending !== null || support.kind === 'unavailable',
    ...(support.kind === 'unavailable' ? { description: support.reason } : {}),
    onPress: (): void => {
      tools.run(tool, menuOwner);
    },
  };
}
