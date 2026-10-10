import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { withUniwind } from 'uniwind';
import { cn } from '../design/cn';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { IconButton } from './icon-button';
import { Text } from './text';

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
        icon={torch ? 'sun' : 'moon'}
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
          label={canAsk ? 'Allow' : 'Not allowed in Android settings'}
          disabled={!canAsk}
          onPress={onAsk}
        />
      }
    />
  );
}

export function CodeScanner({
  types,
  hint,
  purpose,
  shape,
  read,
  onClose,
}: CodeScannerProps): ReactNode {
  const [permission, requestPermission] = useCameraPermissions();
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
          void requestPermission();
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
          const refused = read(scanned.data);
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
