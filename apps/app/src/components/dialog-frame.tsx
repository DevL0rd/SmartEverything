import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SheetBody } from './sheet-body';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cn } from '../design/cn';
import { entering, useMotion, type MotionPreference } from '../design/motion';
import { isNative } from '../design/platform';
import { focusView, type FocusTarget } from './focus-request';
import { EscapeScopeVisible } from './escape-scope';
import { Overlay, useOverlayShown } from './overlay';
import { SheetHeader, useSheetHeading, type SheetBackAction } from './sheet-header';
import { SheetNavigationProvider, useSheetNavigation } from './sheet-navigation';

export interface DialogFrameProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly title?: string | undefined;
  readonly headerAction?: ReactNode;
  readonly kind: 'dialog' | 'inspector';
  readonly wide?: boolean;
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly reading?: boolean;
  readonly initialFocus?: RefObject<FocusTarget | null>;
  readonly children: ReactNode;
}

function useDialogEntry(
  kind: DialogFrameProps['kind'],
  motion: MotionPreference,
  initialFocus: RefObject<FocusTarget | null> | undefined,
): { readonly ref: RefObject<View | null> } & ReturnType<typeof entering> {
  const ref = useRef<View>(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!entered) return;
    if (initialFocus !== undefined) {
      focusView(initialFocus.current);
    } else if (!isNative()) {
      const panel: unknown = ref.current;
      if (panel instanceof HTMLElement && !panel.contains(document.activeElement)) {
        focusView(ref.current);
      }
    }
  }, [entered, initialFocus]);
  if (motion.reduced) return { ref };
  const appear = (kind === 'dialog' ? FadeIn : SlideInRight)
    .duration(250)
    .withCallback((finished) => {
      'worklet';
      if (finished) scheduleOnRN(setEntered, true);
    });
  return { ref, ...entering(motion, appear) };
}

type PageStack = ReturnType<typeof useSheetNavigation>['pages'];

const BODY_PADDING = 'px-6 pb-6 pt-2';

function bodyFrameOf(scroll: boolean, fill: boolean): string {
  if (!scroll) return 'h-picker max-h-full';
  return fill ? 'min-h-0 flex-1' : 'shrink';
}

function PageBody({
  visible,
  scroll,
  fill,
  reading,
  children,
}: {
  readonly visible: boolean;
  readonly scroll: boolean;
  readonly fill: boolean;
  readonly reading: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <EscapeScopeVisible value={visible}>
      <View
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        className={cn(bodyFrameOf(scroll, fill), !visible && 'hidden')}
      >
        <SheetBody scroll={scroll} reading={reading} padding={BODY_PADDING}>
          {children}
        </SheetBody>
      </View>
    </EscapeScopeVisible>
  );
}

function PanelPages({
  pages,
  scroll,
  fill,
  reading,
  children,
}: {
  readonly pages: PageStack;
  readonly scroll: boolean;
  readonly fill: boolean;
  readonly reading: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <>
      <PageBody visible={pages.length === 0} scroll={scroll} fill={fill} reading={reading}>
        {children}
      </PageBody>
      {pages.map(({ id, page }, index) => (
        <PageBody
          key={id}
          visible={index === pages.length - 1}
          scroll={page.scroll !== false}
          fill={fill}
          reading={false}
        >
          {page.children}
        </PageBody>
      ))}
    </>
  );
}

function PanelFooter({ footer }: { readonly footer: ReactNode }): ReactNode {
  if (footer === undefined) return null;
  return (
    <View className="flex-row justify-end gap-2 border-t border-outline-variant px-6 py-4">
      {footer}
    </View>
  );
}

function DialogPanel({
  title,
  headerAction,
  back,
  pages,
  onClose,
  kind,
  wide,
  footer,
  scroll,
  reading,
  titleFocus,
  initialFocus,
  motion,
  children,
}: Omit<DialogFrameProps, 'open' | 'label'> & {
  readonly back: SheetBackAction | undefined;
  readonly pages: PageStack;
  readonly wide: boolean;
  readonly scroll: boolean;
  readonly titleFocus: RefObject<View | null> | undefined;
  readonly motion: MotionPreference;
}): ReactNode {
  const entry = useDialogEntry(kind, motion, initialFocus);
  const shown = useOverlayShown();
  const dialog = kind === 'dialog';
  return (
    <Animated.View
      {...entry}
      onLayout={shown}
      className={cn(
        'overflow-hidden bg-surface-raised elevation-3',
        dialog ? 'max-h-full w-full rounded-xl' : 'h-full w-inspector max-w-full',
        dialog && (wide ? 'max-w-dialog-wide' : 'max-w-dialog'),
      )}
    >
      <View className="pt-4">
        <SheetHeader
          {...{ title, onClose, titleFocus, back }}
          touch={false}
          action={headerAction}
        />
      </View>
      <PanelPages pages={pages} scroll={scroll} fill={!dialog} reading={reading === true}>
        {children}
      </PanelPages>
      <PanelFooter footer={footer} />
    </Animated.View>
  );
}

interface DialogPages {
  readonly navigation: ReturnType<typeof useSheetNavigation>;
  readonly back: SheetBackAction | undefined;
  readonly closeAll: () => void;
  readonly label: string;
  readonly title: string | undefined;
  readonly headerAction: ReactNode;
  readonly footer: ReactNode;
}

function useDialogPages({
  onClose,
  label,
  title,
  headerAction,
  footer,
}: Pick<DialogFrameProps, 'onClose' | 'label' | 'title' | 'headerAction' | 'footer'>): DialogPages {
  const navigation = useSheetNavigation(onClose);
  const { pages } = navigation;
  const closeAll = (): void => {
    for (const entry of [...pages].reverse()) entry.page.onClose();
    onClose();
  };
  const active = pages.at(-1);
  if (active === undefined) {
    return { navigation, back: undefined, closeAll, label, title, headerAction, footer };
  }
  return {
    navigation,
    back: {
      key: active.id,
      label: `Back to ${pages.at(-2)?.page.title ?? title ?? label}`,
      onPress: navigation.back,
      focus: active.focusBack,
    },
    closeAll,
    label: active.page.title,
    title: active.page.title,
    headerAction: undefined,
    footer: active.page.footer,
  };
}

function overlayPlacementOf(kind: DialogFrameProps['kind']): string {
  return kind === 'dialog' ? 'items-center justify-center p-6' : 'items-end';
}

export function DialogFrame({
  open,
  onClose,
  label,
  title,
  headerAction,
  kind,
  wide = false,
  footer,
  scroll = true,
  reading = false,
  initialFocus,
  children,
}: DialogFrameProps): ReactNode {
  const motion = useMotion();
  const titleFocus = useSheetHeading(reading);
  const shown = useDialogPages({ onClose, label, title, headerAction, footer });
  const { navigation } = shown;
  return (
    <Overlay
      open={open}
      onClose={navigation.back}
      label={shown.label}
      initialFocus={titleFocus ?? (motion.reduced ? initialFocus : undefined)}
      pointerBackdrop={reading}
      scrim
      className={overlayPlacementOf(kind)}
    >
      <SheetNavigationProvider navigation={navigation.navigation}>
        <DialogPanel
          onClose={shown.closeAll}
          back={shown.back}
          pages={navigation.pages}
          title={shown.title}
          headerAction={shown.headerAction}
          kind={kind}
          wide={wide}
          footer={shown.footer}
          scroll={scroll}
          reading={reading}
          titleFocus={titleFocus}
          motion={motion}
          {...(initialFocus === undefined ? {} : { initialFocus })}
        >
          {children}
        </DialogPanel>
      </SheetNavigationProvider>
    </Overlay>
  );
}
