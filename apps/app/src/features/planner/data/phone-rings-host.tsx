import type { ReactNode } from 'react';
import { usePhoneRingsSync } from './phone-rings';

export function PhoneRingsHost(): ReactNode {
  usePhoneRingsSync();
  return null;
}
