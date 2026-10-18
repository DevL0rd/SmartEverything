import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { router, useNavigation, type Href } from 'expo-router';
import Head from 'expo-router/head';
import { useNavigationState } from 'expo-router/react-navigation';
import { PageSettingsButton, type PageSettingsLink } from './page-settings-button';
import { useSizeClass, type HeaderKind } from '../design/size-class';
import { Breadcrumbs, type Crumb } from './breadcrumbs';
import { useHeaderSearchHandler } from './header-search';
import { useHeaderStatus } from './header-status';
import { Button } from './button';
import type { IconName } from './icon';
import { IconButton } from './icon-button';
import { Interactive } from './interactive';
import { OverflowButton, type MenuItem } from './menu';
import { usePrimaryActionPlacement } from './primary-action';
import { useHeaderSlot, useScreen } from './screen-context';
import { Text } from './text';

export interface HeaderAction {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress?: () => void;
  readonly href?: Href;
  readonly primary?: boolean;
  readonly selected?: boolean;
  readonly shortcut?: string;
  readonly iconOnly?: boolean;
}

export interface HeaderEditing {
  readonly onDone: () => void;
  readonly onCancel: () => void;
  readonly dirty: boolean;
}

interface HeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly back?: boolean;
  readonly actions?: readonly HeaderAction[];
  readonly below?: ReactNode;
  readonly editing?: HeaderEditing | null;
  readonly breadcrumbs?: readonly Crumb[];
  readonly search?: boolean;
  readonly onTitlePress?: () => void;
  readonly titleLines?: 1 | 2;
}

export type PageHeaderProps = HeaderProps &
  (
    | { readonly settings: PageSettingsLink; readonly overflow?: never }
    | { readonly settings?: never; readonly overflow?: readonly MenuItem[] }
  );

const COLLAPSE_AT = 48;

const TOUCH_ACTIONS = 2;

function useBack(back: boolean | undefined): (() => void) | null {
  const navigation = useNavigation();
  const depth = useNavigationState((state) => state.index);
  const shown = back ?? (depth > 0 || navigation.canGoBack());
  return shown
    ? (): void => {
        navigation.goBack();
      }
    : null;
}

function overflowItems(
  actions: readonly HeaderAction[],
  overflow: readonly MenuItem[],
): readonly MenuItem[] {
  return [
    ...actions.map((action) => ({
      label: action.label,
      icon: action.icon,
      onPress: action.onPress ?? ((): void => undefined),
    })),
    ...overflow,
  ];
}

function SearchAction(): ReactNode {
  const openSearch = useHeaderSearchHandler();
  const { chromeSearch } = useSizeClass();
  if (chromeSearch || openSearch === null) {
    return null;
  }
  return <IconButton icon="search" label="Search" onPress={openSearch} />;
}

function settingsMenuItem(settings: PageSettingsLink): MenuItem {
  return {
    label: settings.label,
    icon: 'settings',
    onPress: (): void => {
      router.push(settings.href);
    },
  };
}

function TouchMenu({
  rest,
  settings,
}: {
  readonly rest: readonly MenuItem[];
  readonly settings: PageSettingsLink | undefined;
}): ReactNode {
  if (settings === undefined) {
    return rest.length === 0 ? null : <OverflowButton items={rest} />;
  }
  if (rest.length === 0) {
    return <PageSettingsButton settings={settings} />;
  }
  return <OverflowButton items={[...rest, settingsMenuItem(settings)]} />;
}

function TouchActions({
  actions,
  overflow,
  search,
  settings,
}: {
  readonly actions: readonly HeaderAction[];
  readonly overflow: readonly MenuItem[];
  readonly search: boolean;
  readonly settings: PageSettingsLink | undefined;
}): ReactNode {
  const shown = actions.slice(0, TOUCH_ACTIONS);
  const rest = overflowItems(actions.slice(TOUCH_ACTIONS), overflow);
  const { primaryAction } = useScreen();
  const placed = usePrimaryActionPlacement() === 'header' ? primaryAction : null;
  return (
    <View className="flex-row items-center">
      {search ? <SearchAction /> : null}
      {placed === null ? null : (
        <IconButton icon={placed.icon} label={placed.label} onPress={placed.onPress} />
      )}
      {shown.map((action) => (
        <IconButton
          key={action.label}
          icon={action.icon}
          label={action.label}
          selected={action.selected ?? false}
          {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
          {...(action.href === undefined ? {} : { href: action.href })}
        />
      ))}
      <TouchMenu rest={rest} settings={settings} />
    </View>
  );
}

function PointerAction({
  action,
  compact,
}: {
  readonly action: HeaderAction;
  readonly compact: boolean;
}): ReactNode {
  const press = {
    ...(action.onPress === undefined ? {} : { onPress: action.onPress }),
    ...(action.href === undefined ? {} : { href: action.href }),
  };
  if (action.iconOnly === true || compact) {
    return (
      <IconButton
        icon={action.icon}
        label={action.label}
        selected={action.selected ?? false}
        {...(action.shortcut === undefined ? {} : { shortcut: action.shortcut })}
        {...press}
      />
    );
  }
  return (
    <Button
      label={action.label}
      icon={action.icon}
      variant={action.primary === true ? 'filled' : 'tonal'}
      {...press}
    />
  );
}

function PointerActions({
  actions,
  overflow,
}: {
  readonly actions: readonly HeaderAction[];
  readonly overflow: readonly MenuItem[];
}): ReactNode {
  const { primaryAction } = useScreen();
  const compact = useSizeClass().width === 'compact';
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-2">
      {actions.map((action) => (
        <PointerAction key={action.label} action={action} compact={compact} />
      ))}
      {primaryAction === null ? null : (
        <PointerAction action={{ ...primaryAction, primary: true }} compact={compact} />
      )}
      {overflow.length === 0 ? null : <OverflowButton items={overflow} />}
    </View>
  );
}

function EditBar({ editing }: { readonly editing: HeaderEditing }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Button label="Cancel" variant="text" onPress={editing.onCancel} />
      <Button label="Done" onPress={editing.onDone} />
    </View>
  );
}

function Trailing(props: PageHeaderProps & { readonly kind: HeaderKind }): ReactNode {
  const status = useHeaderStatus();
  if (props.editing !== undefined && props.editing !== null) {
    return <EditBar editing={props.editing} />;
  }
  const actions = props.actions ?? [];
  const overflow = props.overflow ?? [];
  return (
    <View className="flex-row items-center gap-1">
      {status}
      {props.kind === 'desktop' ? (
        <PointerActions actions={actions} overflow={overflow} />
      ) : (
        <TouchActions
          actions={actions}
          overflow={overflow}
          search={props.search ?? true}
          settings={props.settings}
        />
      )}
      {props.kind === 'desktop' && props.settings !== undefined ? (
        <PageSettingsButton settings={props.settings} />
      ) : null}
    </View>
  );
}

function AppBarTitle({
  title,
  onPress,
}: {
  readonly title: string;
  readonly onPress: (() => void) | undefined;
}): ReactNode {
  const text = (
    <Text variant="title-3" numberOfLines={1} accessibilityRole="header">
      {title}
    </Text>
  );
  if (onPress === undefined) {
    return text;
  }
  return (
    <Interactive
      label={`${title}, details`}
      onPress={onPress}
      className="min-h-touch-min justify-center rounded-md px-1"
      layerClassName="rounded-md"
    >
      {text}
    </Interactive>
  );
}

function AppBar(props: PageHeaderProps & { readonly kind: HeaderKind }): ReactNode {
  const back = useBack(props.back);
  const { scrollY, scrollable } = useScreen();
  const large = props.kind === 'large' && scrollable;
  const titleStyle = useAnimatedStyle(() => ({
    opacity: large
      ? interpolate(scrollY.get(), [COLLAPSE_AT - 16, COLLAPSE_AT], [0, 1], 'clamp')
      : 1,
  }));
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, COLLAPSE_AT], [0, 1], 'clamp'),
  }));
  return (
    <View className="z-10 pt-safe">
      <Animated.View
        pointerEvents="none"
        style={surfaceStyle}
        className="absolute inset-0 border-b border-outline-variant bg-chrome"
      />
      <View className="h-app-bar flex-row items-center gap-1 px-1">
        {back === null ? (
          <View className="w-3" />
        ) : (
          <IconButton icon="arrowLeft" label="Back" onPress={back} />
        )}
        <Animated.View style={titleStyle} className="min-w-0 flex-1 px-1">
          <AppBarTitle title={props.title} onPress={props.onTitlePress} />
        </Animated.View>
        <Trailing {...props} />
      </View>
      {large ? null : props.below}
    </View>
  );
}

function LargeTitle(props: PageHeaderProps): ReactNode {
  return (
    <View className="gap-1 pb-4 pt-2">
      <Text variant="large-title" accessibilityRole="header" numberOfLines={2}>
        {props.title}
      </Text>
      {props.subtitle === undefined ? null : (
        <Text variant="callout" tone="variant" numberOfLines={2}>
          {props.subtitle}
        </Text>
      )}
      {props.below === undefined ? null : <View className="pt-3">{props.below}</View>}
    </View>
  );
}

function DesktopHeader(props: PageHeaderProps): ReactNode {
  const back = useBack(props.back);
  return (
    <View className="gap-3 pb-2 pt-6">
      <View className="min-h-page-header flex-row flex-wrap items-center gap-x-4 gap-y-2">
        {back === null ? null : (
          <IconButton icon="arrowLeft" label="Back" onPress={back} shortcut="Alt ←" />
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          {props.breadcrumbs === undefined ? null : <Breadcrumbs crumbs={props.breadcrumbs} />}
          <Text variant="title-1" accessibilityRole="header" numberOfLines={props.titleLines ?? 1}>
            {props.title}
          </Text>
          {props.subtitle === undefined ? null : (
            <Text variant="callout" tone="variant" numberOfLines={1}>
              {props.subtitle}
            </Text>
          )}
        </View>
        <Trailing {...props} kind="desktop" />
      </View>
      {props.below}
    </View>
  );
}

export function PageHeader(props: PageHeaderProps): ReactNode {
  const slot = useHeaderSlot();
  const { header } = useSizeClass();
  const { scrollable } = useScreen();
  if (slot === 'large') {
    if (header === 'large' && scrollable) {
      return <LargeTitle {...props} />;
    }
    return header === 'desktop' ? <DesktopHeader {...props} /> : null;
  }
  return (
    <>
      <Head>
        <title>{`${props.title} · SmartEverything`}</title>
      </Head>
      {header === 'desktop' ? null : <AppBar {...props} kind={header} />}
    </>
  );
}
