import { useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';
import { COMPACT_PANEL_INSET, SHEET_GRABBER } from './compact-panel';
import { useFocusRequest } from './focus-request';
import { IconButton } from './icon-button';
import { Text } from './text';

function headerInset(touch: boolean, compact: boolean): string {
  if (!touch) return 'pl-6 pr-2';
  return compact ? COMPACT_PANEL_INSET : 'px-4';
}

export interface SheetBackAction {
  readonly key: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly focus: boolean;
}

function SheetBack({ action }: { readonly action: SheetBackAction }): ReactNode {
  const ref = useFocusRequest(action.focus);
  return <IconButton ref={ref} icon="chevronLeft" label={action.label} onPress={action.onPress} />;
}

export function useSheetHeading(reading = false): RefObject<View | null> | undefined {
  const heading = useRef<View>(null);
  return reading ? heading : undefined;
}

function SheetTitle({
  title,
  touch,
  compact,
  focus,
}: {
  readonly title: string;
  readonly touch: boolean;
  readonly compact: boolean;
  readonly focus: RefObject<View | null> | undefined;
}): ReactNode {
  const text = (
    <Text
      variant={touch && !compact ? 'title-2' : 'title-3'}
      accessibilityRole={focus === undefined ? 'header' : undefined}
      className={focus === undefined ? 'flex-1' : ''}
      numberOfLines={touch ? undefined : 2}
    >
      {title}
    </Text>
  );
  return focus === undefined ? (
    text
  ) : (
    <View
      ref={focus}
      accessible
      accessibilityRole="header"
      accessibilityLabel={title}
      tabIndex={isNative() ? undefined : -1}
      className="min-w-0 flex-1 rounded-sm web:focus-visible:outline-2 web:focus-visible:-outline-offset-2 web:focus-visible:outline-focus"
    >
      {text}
    </View>
  );
}

export function SheetHeader({
  title,
  onClose,
  touch,
  compact = false,
  back,
  titleFocus,
}: {
  readonly title: string | undefined;
  readonly onClose: () => void;
  readonly touch: boolean;
  readonly compact?: boolean;
  readonly back?: SheetBackAction | undefined;
  readonly titleFocus?: RefObject<View | null> | undefined;
}): ReactNode {
  if (title === undefined) {
    return null;
  }
  return (
    <View
      className={cn('min-h-touch-min flex-row items-center gap-2', headerInset(touch, compact))}
    >
      {back === undefined ? null : <SheetBack key={back.key} action={back} />}
      <SheetTitle title={title} touch={touch} compact={compact} focus={titleFocus} />
      {touch ? null : <IconButton icon="close" label="Close" onPress={onClose} shortcut="Esc" />}
    </View>
  );
}

export function SheetHandle({
  title,
  onClose,
  compact,
  back,
  titleFocus,
}: {
  readonly title: string | undefined;
  readonly onClose: () => void;
  readonly compact: boolean;
  readonly back: SheetBackAction | undefined;
  readonly titleFocus: RefObject<View | null> | undefined;
}): ReactNode {
  return (
    <View collapsable={false}>
      <View className="items-center py-2">
        <View className={SHEET_GRABBER} />
      </View>
      <SheetHeader
        title={title}
        onClose={onClose}
        touch
        compact={compact}
        back={back}
        titleFocus={titleFocus}
      />
    </View>
  );
}
