import { createContext, use, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
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

export function SelectionBar({
  style,
  children,
}: {
  readonly style?: ViewStyle | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View style={style} className="flex-row items-center gap-1">
      <View className="min-w-0 flex-1">{children}</View>
      <ShellStatus />
    </View>
  );
}
