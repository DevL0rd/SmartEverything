import { createContext, useContext } from 'react';

export const BodyWidthContext = createContext<number | null>(null);

class BodyWidthUnavailable extends Error {
  constructor() {
    super('The body width is only available inside a page shell or section frame.');
  }
}

export function useFrameBodyWidth(): number {
  const width = useContext(BodyWidthContext);
  if (width === null) throw new BodyWidthUnavailable();
  return width;
}
