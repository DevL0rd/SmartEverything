import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import { Sheet } from '../../../components/sheet';
import { useSheetSubpage } from '../../../components/sheet-navigation';

const OPERATION_DETENTS = ['fit'] as const;

export function WorkOperationSheet({
  title,
  onClose,
  opener,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly opener: RefObject<View | null> | undefined;
  readonly children: ReactNode;
}): ReactNode {
  const nested = useSheetSubpage(true, {
    title,
    onClose,
    children,
    detents: OPERATION_DETENTS,
    opener,
    compact: false,
  });
  return nested ? null : (
    <Sheet open title={title} onClose={onClose} detents={OPERATION_DETENTS}>
      {children}
    </Sheet>
  );
}
