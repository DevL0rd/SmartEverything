import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { BackHandler, View } from 'react-native';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';
import { COMPACT_PANEL_INSET } from './compact-panel';
import { SheetBody } from './sheet-body';
import { SheetHeader } from './sheet-header';
import { SheetNavigationProvider, type useSheetNavigation } from './sheet-navigation';
import { EscapeScopeVisible } from './use-escape';

type Navigation = ReturnType<typeof useSheetNavigation>;
type Entry = Navigation['pages'][number];

export function useHostedNativeBack(active: boolean, back: () => void): void {
  const run = useEffectEvent(back);
  useEffect(() => {
    if (!active || !isNative()) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      run();
      return true;
    });
    return (): void => {
      subscription.remove();
    };
  }, [active]);
}

function PageVisibility({
  visible,
  children,
}: {
  readonly visible: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <EscapeScopeVisible value={visible}>
      <View
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        className={cn('min-h-0 flex-1', !visible && 'hidden')}
      >
        {children}
      </View>
    </EscapeScopeVisible>
  );
}

function Page({
  entry,
  parent,
  back,
}: {
  readonly entry: Entry;
  readonly parent: string;
  readonly back: () => void;
}): ReactNode {
  const { id, page, focusBack } = entry;
  const compact = page.compact !== false;
  const padding = compact ? COMPACT_PANEL_INSET : 'px-4';
  return (
    <>
      <SheetHeader
        title={page.title}
        touch
        compact={compact}
        onClose={back}
        back={{ key: id, label: `Back to ${parent}`, onPress: back, focus: focusBack }}
      />
      <SheetBody scroll={page.scroll !== false} padding={cn(padding, 'pb-1')}>
        {page.children}
      </SheetBody>
      {page.footer === undefined ? null : (
        <View className={cn('flex-row gap-3 pb-3 pt-2', padding)}>{page.footer}</View>
      )}
    </>
  );
}

export function HostedSheetPages({
  navigation,
  label,
  children,
}: {
  readonly navigation: Navigation | null;
  readonly label: string;
  readonly children?: ReactNode;
}): ReactNode {
  if (navigation === null) return children;
  const { pages, back } = navigation;
  return (
    <SheetNavigationProvider navigation={navigation.navigation}>
      <PageVisibility visible={pages.length === 0}>{children}</PageVisibility>
      {pages.map((entry, index) => (
        <PageVisibility key={entry.id} visible={index === pages.length - 1}>
          <Page entry={entry} parent={pages[index - 1]?.page.title ?? label} back={back} />
        </PageVisibility>
      ))}
    </SheetNavigationProvider>
  );
}
