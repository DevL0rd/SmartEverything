import { router, type Href } from 'expo-router';

export function closeFlow(fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
