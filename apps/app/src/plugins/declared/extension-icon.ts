import { isIconName, type IconName } from '../../components/icon';

export const EXTENSION_FALLBACK_ICON: IconName = 'puzzle';

export function extensionIcon(name: string): IconName {
  return isIconName(name) ? name : EXTENSION_FALLBACK_ICON;
}
