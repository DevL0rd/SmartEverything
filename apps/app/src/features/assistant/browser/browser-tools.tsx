import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { copyText } from '../../../components/copy-button';
import { notify } from '../../../components/toast-store';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { useValue } from '../../../design/external-store';
import { BrowserOverlayOwner, browserCovered } from '../../../platform/browser-overlays';
import { rememberBrowserFocus, restoreBrowserFocus } from '../../../platform/browser-focus';
import type { BrowserHandle } from '../../../platform/browser-contract';
import { useBrowserActionScope } from './browser-action-scope';
import { useRequestedBrowserAction } from './browser-requested-action';
export function BrowserTools({
  controls,
  address,
  ready,
  tabActions,
}: {
  readonly controls: BrowserHandle;
  readonly address: string | null;
  readonly ready: boolean;
  readonly tabActions: readonly MenuItem[];
}): ReactNode {
  const active = useBrowserActionScope();
  const [menuOwner] = useState(() => Symbol('browser-options'));
  const covered = useValue(browserCovered);
  useEffect(() => {
    if (active && !covered) restoreBrowserFocus('tools');
  }, [active, covered]);
  const reload = (): void => {
    if (ready) controls.reload();
    else notify({ message: 'Open a page to reload', tone: 'default' });
  };
  const copy = (): void => {
    if (address !== null) copyText(address, 'Address');
    else notify({ message: 'This page has no address to copy', tone: 'default' });
  };
  const { ref, open, menu } = useAnchoredMenu(
    [
      { label: 'Reload', icon: 'refresh', disabled: !ready, onPress: reload },
      {
        label: 'Copy address',
        icon: 'copy',
        disabled: address === null,
        ...(address === null ? { description: 'This page has no address to copy.' } : {}),
        onPress: copy,
      },
      ...tabActions,
    ],
    'Browser options',
  );
  const show = (): void => {
    rememberBrowserFocus('tools');
    open();
  };
  useRequestedBrowserAction({ reload, copy, menu: show });
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon="ellipsisVertical" label="Browser options" onPress={show} />
      <BrowserOverlayOwner value={menuOwner}>{menu}</BrowserOverlayOwner>
    </View>
  );
}
