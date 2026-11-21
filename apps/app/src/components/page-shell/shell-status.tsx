import { useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { useHeaderStatus } from '../header-status';
import { StatusFormContext, type StatusForm } from './shell-status-context';

export function useStatusForm(): StatusForm {
  return useContext(StatusFormContext);
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
