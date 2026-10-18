import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeType,
  type PermissionResponse,
} from 'expo-camera';
import { withUniwind } from 'uniwind';
import { cn } from '../design/cn';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { IconButton } from './icon-button';
import { Text } from './text';

const log = new Logger('app.scanner');

const StyledCamera = withUniwind(CameraView);

export interface CodeScannerProps {
  readonly types: readonly BarcodeType[];
  readonly hint: string;
  readonly purpose: string;
  readonly shape: 'square' | 'wide';
  readonly read: (data: string) => string | null;
  readonly onClose: () => void;
}

function Frame({
  message,
  shape,
}: {
  readonly message: string;
  readonly shape: CodeScannerProps['shape'];
}): ReactNode {
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center gap-6 p-8">
      <View
        className={cn(
          'w-full rounded-xl border-4 border-white',
          shape === 'square' ? 'aspect-square max-w-72' : 'aspect-video max-w-80',
        )}
      />
      <View className="rounded-full bg-surface-raised px-4 py-2 elevation-2">
        <Text variant="callout" align="center">
          {message}
        </Text>
      </View>
    </View>
  );
}

function Bar({
  torch,
  onTorch,
  onClose,
}: {
  readonly torch: boolean;
  readonly onTorch: (torch: boolean) => void;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View className="absolute inset-x-0 top-0 flex-row justify-between px-2 pt-safe-offset-2">
      <IconButton icon="close" label="Close scanner" variant="overlay" onPress={onClose} />
      <IconButton
        icon="flashlight"
        label={torch ? 'Turn torch off' : 'Turn torch on'}
        variant="overlay"
        selected={torch}
        onPress={() => {
          onTorch(!torch);
        }}
      />
    </View>
  );
}

function openSettings(): void {
  log.info('scanner.settings_opened');
  background(Linking.openSettings(), 'settings.open_failed');
}

function CameraPermission({
  purpose,
  canAsk,
  onAsk,
}: {
  readonly purpose: string;
  readonly canAsk: boolean;
  readonly onAsk: () => void;
}): ReactNode {
  return (
    <EmptyState
      icon="camera"
      title="Allow the camera"
      body={purpose}
      action={
        <Button
          label={canAsk ? 'Allow' : 'Open settings'}
          onPress={canAsk ? onAsk : openSettings}
        />
      }
    />
  );
}

function judge(
  read: CodeScannerProps['read'],
  scanned: { readonly type: string; readonly data: string },
): string | null {
  const refused = read(scanned.data);
  const fields = { type: scanned.type, length: scanned.data.length };
  if (refused === null) log.info('scanner.code_accepted', fields);
  else log.debug('scanner.code_refused', fields);
  return refused;
}

function asked(request: () => Promise<PermissionResponse>): Promise<PermissionResponse> {
  log.info('scanner.permission_asked');
  return request();
}

function useLoggedPermissions(): ReturnType<typeof useCameraPermissions> {
  const result = useCameraPermissions();
  const permission = result[0];
  const state = permission === null ? 'unknown' : permission.granted ? 'granted' : 'denied';
  const canAsk = permission?.canAskAgain ?? null;
  useEffect(() => {
    log.info('scanner.permission', { state, canAsk });
  }, [state, canAsk]);
  return result;
}

export function CodeScanner({
  types,
  hint,
  purpose,
  shape,
  read,
  onClose,
}: CodeScannerProps): ReactNode {
  const [permission, requestPermission] = useLoggedPermissions();
  const [problem, setProblem] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const handled = useRef(false);
  if (permission === null) {
    return null;
  }
  if (!permission.granted) {
    return (
      <CameraPermission
        purpose={purpose}
        canAsk={permission.canAskAgain}
        onAsk={() => {
          background(asked(requestPermission), 'code_scanner.asked_failed');
        }}
      />
    );
  }
  return (
    <View className="absolute inset-0 bg-black">
      <StyledCamera
        className="flex-1"
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: [...types] }}
        onBarcodeScanned={(scanned) => {
          if (handled.current) {
            return;
          }
          const refused = judge(read, scanned);
          if (refused !== null) {
            setProblem(refused);
            return;
          }
          handled.current = true;
        }}
      />
      <Frame message={problem ?? hint} shape={shape} />
      <Bar torch={torch} onTorch={setTorch} onClose={onClose} />
    </View>
  );
}
