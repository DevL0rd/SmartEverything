import { createContext, useContext } from 'react';
import type { ComposerClass } from '../model/ai-layout';

const ComposerClassContext = createContext<ComposerClass>('regular');

export const ComposerClassProvider = ComposerClassContext.Provider;

export function useComposerClass(): ComposerClass {
  return useContext(ComposerClassContext);
}
