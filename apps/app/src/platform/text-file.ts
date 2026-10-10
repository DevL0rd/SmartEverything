import { requireOptionalNativeModule } from 'expo';
import { PickerMissingError } from './pick-files';

const DOCUMENT_PICKER_MODULE = 'ExpoDocumentPicker';

export async function pickTextFile(accept: string): Promise<string | null> {
  if (requireOptionalNativeModule(DOCUMENT_PICKER_MODULE) === null) {
    throw new PickerMissingError('Update the app to choose a key file.');
  }
  const picker = await import('expo-document-picker');
  const result = await picker.getDocumentAsync({
    type: accept.split(','),
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? null : (result.assets.at(0) ?? null);
  if (asset === null) {
    return null;
  }
  return (await fetch(asset.uri)).text();
}
