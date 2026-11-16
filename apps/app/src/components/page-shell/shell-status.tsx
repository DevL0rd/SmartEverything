import { createContext, use, type ReactNode } from 'react';
import { View } from 'react-native';
import { useHeaderStatus } from '../header-status';

export type StatusForm = 'chip' | 'icon';

const StatusFormContext = createContext<StatusForm>('chip');

export function useStatusForm(): StatusForm {
  return use(StatusFormContext);
}

export const StatusFormProvider = StatusFormContext;

export function ShellStatus(): ReactNode {
  const status = useHeaderStatus();
  return (
    <View testID="shell-status" className="shrink-0 flex-row items-center gap-1">
      {status}
    </View>
  );
}
