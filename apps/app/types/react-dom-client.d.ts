declare module 'react-dom/client' {
  import type { ReactNode } from 'react';

  export interface Root {
    render(node: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: object): Root;
}
