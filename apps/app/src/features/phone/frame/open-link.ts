import { createContext, useContext } from 'react';

export class OutsidePhoneFrameError extends Error {
  override readonly name = 'OutsidePhoneFrameError';

  constructor() {
    super('Expected the open-link action inside a PhoneFrame.');
  }
}

export const OpenLinkContext = createContext<(() => void) | null>(null);

export function useOpenLink(): () => void {
  const open = useContext(OpenLinkContext);
  if (open === null) throw new OutsidePhoneFrameError();
  return open;
}
