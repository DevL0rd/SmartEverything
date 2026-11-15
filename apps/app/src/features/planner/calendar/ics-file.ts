import { PLANNER_ICS_CONTENT_TYPE } from '@smarteverything/domain';
import { requireOptionalNativeModule } from 'expo';
import { Directory } from 'expo-file-system';
import { PickerMissingError } from '../../../platform/pick-files';

const ICS_TYPES = [PLANNER_ICS_CONTENT_TYPE, 'application/ics', 'text/x-vcalendar'];

export async function pickIcsFile(): Promise<Blob | null> {
  if (requireOptionalNativeModule('ExpoDocumentPicker') === null) {
    throw new PickerMissingError('Update the app to import a calendar file.');
  }
  const picker = await import('expo-document-picker');
  const result = await picker.getDocumentAsync({ type: ICS_TYPES, copyToCacheDirectory: true });
  const asset = result.canceled ? null : (result.assets.at(0) ?? null);
  if (asset === null) return null;
  return (await fetch(asset.uri)).blob();
}

export async function saveIcsFile(name: string, bytes: Uint8Array): Promise<void> {
  const folder = await Directory.pickDirectoryAsync();
  const file = folder.createFile(name, PLANNER_ICS_CONTENT_TYPE);
  file.write(bytes);
}
