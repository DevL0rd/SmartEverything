import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';

export function leaveViewer(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(href.cameras());
}
