import type { SmartEverythingDesktop } from '@smarteverything/domain';

declare global {
  interface Window {
    smartEverythingDesktop?: SmartEverythingDesktop;
  }
}
