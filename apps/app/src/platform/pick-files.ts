import { requireOptionalNativeModule } from 'expo';

export type PickSource = 'camera' | 'photos' | 'files';

export interface PickedFile {
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly preview: string | null;
  readonly data: () => Promise<ArrayBuffer>;
}

export class PickerMissingError extends Error {
  override readonly name = 'PickerMissingError';
}

const MODULES: Readonly<Record<PickSource, string>> = {
  camera: 'ExponentImagePicker',
  photos: 'ExponentImagePicker',
  files: 'ExpoDocumentPicker',
};

function fromUri(uri: string, name: string, mime: string, bytes: number): PickedFile {
  return {
    name,
    mime,
    bytes,
    preview: mime.startsWith('image/') ? uri : null,
    data: async () => (await fetch(uri)).arrayBuffer(),
  };
}

async function pickImages(source: 'camera' | 'photos'): Promise<readonly PickedFile[]> {
  const picker = await import('expo-image-picker');
  const options = { mediaTypes: ['images' as const], quality: 0.85, allowsMultipleSelection: true };
  if (source === 'camera') {
    const permission = await picker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new PickerMissingError('Allow camera access to take a photo.');
    }
  }
  const result =
    source === 'camera'
      ? await picker.launchCameraAsync(options)
      : await picker.launchImageLibraryAsync(options);
  if (result.canceled) {
    return [];
  }
  return result.assets.map((asset, index) =>
    fromUri(
      asset.uri,
      asset.fileName ?? `photo-${String(index + 1)}.jpg`,
      asset.mimeType ?? 'image/jpeg',
      asset.fileSize ?? 0,
    ),
  );
}

async function pickDocuments(): Promise<readonly PickedFile[]> {
  const picker = await import('expo-document-picker');
  const result = await picker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (result.canceled) {
    return [];
  }
  return result.assets.map((asset) =>
    fromUri(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream', asset.size ?? 0),
  );
}

export async function pickFiles(source: PickSource): Promise<readonly PickedFile[]> {
  if (requireOptionalNativeModule(MODULES[source]) === null) {
    throw new PickerMissingError('Update the app to attach files.');
  }
  return source === 'files' ? pickDocuments() : pickImages(source);
}

export function filesOfTransfer(_transfer: unknown): readonly PickedFile[] {
  return [];
}
