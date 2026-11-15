import { createContext } from 'react';
import type { LibraryOrigin } from './library-pages';

export const LibraryActionFocus = createContext(false);

export const LibraryOriginFocus = createContext<LibraryOrigin | null>(null);
