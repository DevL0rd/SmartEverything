import { DevSettings } from 'react-native';
import { isNative } from '../design/platform';

export function reloadApp(): void {
  if (isNative()) {
    DevSettings.reload();
  } else {
    window.location.reload();
  }
}
