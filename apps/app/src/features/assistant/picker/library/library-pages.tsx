import { createContext, use, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../../components/icon-button';
import { SelectionBar } from '../../../../components/files/selection-bar';
import { Text } from '../../../../components/text';
import { useFocusRequest } from '../../../../components/focus-request';
import { isNative } from '../../../../design/platform';
import type { PrimaryAction } from './library-model';
import { PanelSubpageContext, usePanelSubpage } from '../panel/panel-subpage';
import { CatalogueMeasure } from './catalogue-fit';

export const LibraryActionFocus = createContext(false);
type LibraryOrigin = 'filters' | 'detail';
export const LibraryOriginFocus = createContext<LibraryOrigin | null>(null);

export function useLibraryBack(
  page: LibraryOrigin | 'results',
  showResults: () => void,
): { readonly back: () => void; readonly origin: LibraryOrigin | null } {
  const [origin, setOrigin] = useState<LibraryOrigin | null>(null);
  const back = (): void => {
    if (page === 'results') return;
    setOrigin(page);
    showResults();
  };
  const title = page === 'results' ? null : page === 'filters' ? 'Filters' : 'Details';
  usePanelSubpage(title, page === 'results' ? null : back);
  return { back, origin };
}

export function useLibraryActionFocus(): ReturnType<typeof useFocusRequest> {
  const restore = use(LibraryActionFocus);
  return useFocusRequest(restore && isNative());
}

export function LibraryBack({
  title,
  onBack,
  children,
  footer,
}: {
  readonly title: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}): ReactNode {
  const hosted = use(PanelSubpageContext) !== null;
  return (
    <View className="min-h-0 flex-1">
      {hosted ? null : (
        <View className="flex-row items-center gap-1 border-b border-outline-variant px-2">
          <IconButton icon="chevronLeft" label="Back" onPress={onBack} />
          <Text variant="body-strong">{title}</Text>
        </View>
      )}
      {children}
      {footer}
    </View>
  );
}

export function LibrarySelectionBar({
  name,
  source,
  action,
  onDetails,
}: {
  readonly name: string;
  readonly source: string;
  readonly action: PrimaryAction | null;
  readonly onDetails: () => void;
}): ReactNode {
  const actionRef = useLibraryActionFocus();
  const detailsRef = useFocusRequest(use(LibraryOriginFocus) === 'detail');
  return (
    <CatalogueMeasure part="selection">
      <SelectionBar
        docked
        summary={{ kind: 'item', name, caption: source, onDetails }}
        summaryRef={detailsRef}
        primaryRef={actionRef}
        actions={
          action === null
            ? []
            : [
                {
                  label: action.label,
                  variant: 'filled',
                  disabled: action.run === null,
                  ...(action.run === null ? {} : { onPress: action.run }),
                },
              ]
        }
      />
    </CatalogueMeasure>
  );
}
