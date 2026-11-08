import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';

export function closeViewer(): void {
  if (router.canGoBack()) router.back();
  else router.replace(href.photos());
}
