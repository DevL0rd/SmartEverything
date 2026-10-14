import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'expo-router';
import { View } from 'react-native';
import { usePreviewDiagnostics } from './browser-diagnostics';
import { BrowserSurface } from '../../../platform/browser-surface';
import { browserCovered } from '../../../platform/browser-overlays';
import { useValue } from '../../../design/external-store';
import { connectionState } from '../../../api/connection/connection';
import { useStoreSelector } from '../../../store/store-context';
import { useLocalPref } from '../../../store/local-prefs';
import {
  browserSurfaces,
  browserTargetProfile,
  browserTabVisible,
  retainBrowserAuthority,
  ownBrowserRuntime,
  followBrowserRevocations,
  followGatewayRetirements,
  type RetainedBrowserSurface,
} from './browser-runtime';
export function BrowserRuntimeHost(): ReactNode {
  useBrowserAuthority();
  const surfaces = useValue(browserSurfaces);
  const path = usePathname();
  const covered = useValue(browserCovered);
  const open = useLocalPref('chatPanelOpen');
  const host = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const close = ownBrowserRuntime();
    const stop = followBrowserRevocations();
    const gateway = followGatewayRetirements();
    return (): void => {
      stop();
      gateway();
      close();
    };
  }, []);
  return (
    <View
      ref={host}
      pointerEvents="box-none"
      className="absolute inset-0"
      onLayout={() => {
        host.current?.measureInWindow((x, y) => {
          setOrigin({ x, y });
        });
      }}
    >
      {surfaces.map((surface) => (
        <RetainedPage
          key={surface.props.target.id}
          surface={surface}
          origin={origin}
          visible={surfaceVisible(surface, path, open, covered)}
        />
      ))}
    </View>
  );
}
function RetainedPage({
  surface,
  origin,
  visible,
}: {
  readonly surface: RetainedBrowserSurface;
  readonly origin: { readonly x: number; readonly y: number };
  readonly visible: boolean;
}): ReactNode {
  const profileId = browserTargetProfile(surface.chatId, surface.props.target.id);
  const { controller } = usePreviewDiagnostics(
    surface.chatId,
    profileId ?? '',
    profileId === null ? null : surface.props.target,
    visible,
  );
  useEffect(() => {
    controller.setVisible(visible);
    return (): void => {
      controller.setVisible(false);
    };
  }, [controller, visible]);
  const bounds = surface.bounds;
  const frame = {
    position: 'absolute',
    left: bounds.x - origin.x,
    top: bounds.y - origin.y,
    width: bounds.width,
    height: bounds.height,
    opacity: visible ? 1 : 0,
  } as const;
  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      aria-hidden={!visible}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={frame}
    >
      <BrowserSurface {...surface.props} visible={visible} />
    </View>
  );
}

function surfaceVisible(
  surface: RetainedBrowserSurface,
  path: string,
  open: boolean,
  covered: boolean,
): boolean {
  return (
    open &&
    !covered &&
    path === `/assistant/chat/${surface.chatId}` &&
    surface.attached &&
    browserTabVisible(surface.chatId, surface.props.target.id)
  );
}
function useBrowserAuthority(): void {
  const connection = useValue(connectionState);
  const authority = useStoreSelector(
    (state) => ({ session: state.session, chats: state.tables.ai_chats }),
    (left, right) => left.session === right.session && left.chats === right.chats,
  );
  useEffect(() => {
    retainBrowserAuthority(
      connection.status === 'paired' ? connection.connection : null,
      authority.session?.client.profile_id ?? null,
      authority.session?.client.id ?? '',
      new Set(authority.chats.ids),
    );
  }, [connection, authority]);
}
