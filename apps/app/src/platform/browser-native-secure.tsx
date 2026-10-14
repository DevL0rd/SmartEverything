import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { browserAllows, type BrowserStatus } from '@smarteverything/domain';
import type { BrowserSurfaceProps } from './browser-contract';
const INTERCEPT_ALL_NAVIGATIONS = ['*'];
const STYLES = StyleSheet.create({ page: { flex: 1 } });
const POLICY = {
  incognito: true,
  sharedCookiesEnabled: false,
  thirdPartyCookiesEnabled: false,
  cacheEnabled: false,
  setSupportMultipleWindows: true,
  javaScriptCanOpenWindowsAutomatically: false,
  allowFileAccess: false,
  allowFileAccessFromFileURLs: false,
  allowUniversalAccessFromFileURLs: false,
  mixedContentMode: 'never',
  mediaPlaybackRequiresUserAction: true,
  geolocationEnabled: false,
  allowsFullscreenVideo: false,
  saveFormDataDisabled: true,
  webviewDebuggingEnabled: false,
} as const;
export function SecureNativeBrowserSurface({
  target,
  ref,
  onStatus,
  visible,
}: BrowserSurfaceProps): ReactNode {
  const viewRef = useRef<WebView>(null);
  const [url, setUrl] = useState(target.url);
  useImperativeHandle(ref, () => ({
    navigate: (value): void => {
      if (browserAllows(target, value)) setUrl(value);
    },
    back: (): void => {
      viewRef.current?.goBack();
    },
    forward: (): void => {
      viewRef.current?.goForward();
    },
    reload: (): void => {
      viewRef.current?.reload();
    },
    stop: (): void => {
      viewRef.current?.stopLoading();
    },
  }));
  const change = (state: WebViewNavigation): void => {
    onStatus(nativeNavigationStatus(target.id, state));
  };
  const fail = (problem: string): void => {
    onStatus({ id: target.id, url: '', loading: false, back: false, forward: false, problem });
  };
  const loaded = useInitialPreviewPath(target, setUrl);
  return (
    <NativePage
      ref={viewRef}
      target={target}
      url={url}
      visible={visible}
      change={change}
      fail={fail}
      loaded={loaded}
    />
  );
}
function useInitialPreviewPath(
  target: BrowserSurfaceProps['target'],
  setUrl: (value: string) => void,
): (currentUrl: string) => void {
  const [initial, setInitial] = useState(true);
  return (currentUrl): void => {
    if (!initial) return;
    setInitial(false);
    if (target.kind === 'preview') {
      const wanted = new URL(target.initialPath, target.origin).href;
      if (currentUrl !== wanted) setUrl(wanted);
    }
  };
}
interface NativePageProps {
  readonly ref: Ref<WebView>;
  readonly target: BrowserSurfaceProps['target'];
  readonly url: string;
  readonly visible: boolean;
  readonly change: (state: WebViewNavigation) => void;
  readonly fail: (problem: string) => void;
  readonly loaded: (url: string) => void;
}
function NativePage({
  ref,
  target,
  url,
  visible,
  change,
  fail,
  loaded,
}: NativePageProps): ReactNode {
  return (
    <View className={visible ? 'min-h-0 flex-1' : 'min-h-0 flex-1 opacity-0'}>
      <WebView
        ref={ref}
        source={{ uri: url }}
        style={STYLES.page}
        {...POLICY}
        originWhitelist={INTERCEPT_ALL_NAVIGATIONS}
        onShouldStartLoadWithRequest={(request) => browserAllows(target, request.url)}
        onLoad={(event) => {
          loaded(event.nativeEvent.url);
        }}
        onNavigationStateChange={change}
        onLoadStart={(event) => {
          change(event.nativeEvent);
        }}
        onError={() => {
          fail('The page could not be loaded. Check the service and try again.');
        }}
        onHttpError={() => {
          fail('The service returned an error. Check the page and try again.');
        }}
        onRenderProcessGone={() => {
          fail('The Android browser stopped. Open the preview again.');
        }}
        onOpenWindow={() => {
          fail('New windows are blocked in this browser.');
        }}
        onFileDownload={() => {
          fail('Downloads are blocked in this browser.');
        }}
      />
    </View>
  );
}

function nativeNavigationStatus(id: string, state: WebViewNavigation): BrowserStatus {
  return {
    id,
    url: state.url,
    loading: state.loading,
    back: state.canGoBack,
    forward: state.canGoForward,
    problem: null,
  };
}
