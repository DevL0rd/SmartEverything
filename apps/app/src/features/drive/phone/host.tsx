import type { ReactNode } from 'react';
import { useDriveProviderSync } from './provider-sync';

export function DriveProviderHost(): ReactNode {
  useDriveProviderSync();
  return null;
}
