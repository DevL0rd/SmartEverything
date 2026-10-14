import { createContext, useContext } from 'react';
interface AccessoryLayout {
  readonly compact: boolean;
  readonly modelLabelWidth: number;
}
const AccessoryLayoutContext = createContext<AccessoryLayout>({
  compact: false,
  modelLabelWidth: 156,
});
export const ComposerAccessoryLayoutProvider = AccessoryLayoutContext.Provider;
export function useComposerAccessoryLayout(): AccessoryLayout {
  return useContext(AccessoryLayoutContext);
}
