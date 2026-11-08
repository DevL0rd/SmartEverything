import { router } from 'expo-router';
import type { AppHref } from '../components/app-href';

export function closeFlow(fallback: AppHref): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
