import type { DesktopOverlayHelper } from '@smarteverything/domain';

export const HELPER_TITLE = 'Overlay window helper';
export const HELPER_SUBTITLE =
  'KDE needs a small helper so the voice bar stays above other windows and never takes focus.';

export function helperText(helper: DesktopOverlayHelper | null, placedBySystem: boolean): string {
  if (helper === null) {
    return '';
  }
  switch (helper.kind) {
    case 'unused':
      return 'Starts with the first call';
    case 'ready':
      return 'Ready';
    case 'absent':
      return placedBySystem
        ? 'Placement needs KDE. On this desktop the system decides where the bar appears'
        : 'Only used on KDE. On this desktop the app places the bar';
    case 'failed':
      return `Not loaded: ${helper.reason}`;
  }
}
