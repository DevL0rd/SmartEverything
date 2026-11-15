import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import Head from 'expo-router/head';
import { cn } from '../../design/cn';
import { useIdiom } from '../../design/platform';
import { useSizeClass } from '../../design/size-class';
import { useScreenViewport } from '../../design/viewport';
import { EdgeScrim } from '../edge-scrim';
import { useBackAction } from '../back-navigation';
import { IconButton } from '../icon-button';
import { KeyboardViewport } from '../keyboard-viewport';
import { PrimaryAction, usePrimaryActionPlacement } from '../primary-action';
import { ScreenContext, type ScreenValue } from '../screen-context';
import type { VariantShellProps } from './shell-types';
import { ShellSearch } from './search-slot';
import { ShellActions, type ShellAction } from './shell-actions';
import { ShellFooter } from './shell-body';
import { ShellBack, ShellTitle, type BackPress } from './shell-parts';

function useBackPress(shell: VariantShellProps): BackPress {
  const routed = useBackAction(shell.back !== false && shell.onBack === undefined);
  const { onBack } = shell;
  if (shell.back === false) return null;
  if (onBack === undefined) return routed;
  return () => {
    onBack();
    return null;
  };
}

function LeadingActions({ actions }: { readonly actions: readonly ShellAction[] }): ReactNode {
  return actions.map((action) => (
    <IconButton
      key={action.label}
      icon={action.icon}
      label={action.label}
      selected={action.selected ?? false}
      {...(action.shortcut === undefined ? {} : { shortcut: action.shortcut })}
      {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
    />
  ));
}

function useInlineSearch(): boolean {
  return useSizeClass().header === 'desktop';
}

function SearchRow({ shell }: { readonly shell: VariantShellProps }): ReactNode {
  const inline = useInlineSearch();
  if (inline || shell.search === undefined) return null;
  return (
    <View testID="shell-search" className="px-gutter pb-2">
      <ShellSearch search={shell.search} />
    </View>
  );
}

function BarRow({ shell }: { readonly shell: VariantShellProps }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const inline = useInlineSearch();
  const back = useBackPress(shell);
  const leading = shell.leading ?? [];
  const bare = back === null && leading.length === 0;
  return (
    <View className={cn('min-h-14 flex-row items-center gap-1 pr-1', bare ? 'pl-gutter' : 'pl-1')}>
      {back === null ? null : <ShellBack back={back} pointer={pointer} />}
      <LeadingActions actions={leading} />
      <View testID="shell-title" className={cn('min-w-0 flex-1 pr-1', bare ? null : 'pl-1')}>
        {shell.heading ?? <ShellTitle title={shell.title} size="bar" />}
      </View>
      {shell.search === undefined || !inline ? null : (
        <View testID="shell-search" className="min-w-0 max-w-140 shrink grow basis-48">
          <ShellSearch search={shell.search} />
        </View>
      )}
      {shell.trailing}
      <ShellActions
        kind={pointer ? 'pointer' : 'touch'}
        compact
        actions={shell.actions}
        overflow={shell.overflow}
        settings={shell.settings}
        editing={shell.editing}
        primaryAction={shell.primaryAction}
      />
    </View>
  );
}

function VariantBody({ shell }: { readonly shell: VariantShellProps }): ReactNode {
  const fab = usePrimaryActionPlacement() === 'fab' ? shell.primaryAction : undefined;
  return (
    <View className="min-h-0 flex-1">
      {shell.banner === undefined ? null : <View className="px-gutter pt-2">{shell.banner}</View>}
      <View testID="shell-body" className="min-h-0 flex-1">
        {shell.children}
      </View>
      {fab === undefined ? null : <PrimaryAction {...fab} />}
    </View>
  );
}

function VariantProviders({
  shell,
  head,
  children,
}: {
  readonly shell: VariantShellProps;
  readonly head: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const scrollY = useSharedValue(0);
  const viewport = useScreenViewport(scrollY);
  const primaryAction = shell.primaryAction ?? null;
  const value = useMemo<ScreenValue>(
    () => ({ scrollY, scrollRef: null, scrollable: false, primaryAction, viewport }),
    [scrollY, primaryAction, viewport],
  );
  return (
    <ScreenContext value={value}>
      {head ? (
        <Head>
          <title>{`${shell.title} · SmartEverything`}</title>
        </Head>
      ) : null}
      <KeyboardViewport className="min-h-0 flex-1">{children}</KeyboardViewport>
    </ScreenContext>
  );
}

export function OverlayShell(props: VariantShellProps): ReactNode {
  return (
    <VariantProviders shell={props} head>
      <VariantBody shell={props} />
      <View testID="shell-top" className="absolute inset-x-0 top-0 pt-safe">
        <EdgeScrim edge="top" />
        <BarRow shell={props} />
        <SearchRow shell={props} />
        {props.toolbar === undefined ? null : (
          <View testID="shell-toolbar" className="px-gutter pb-2">
            {props.toolbar}
          </View>
        )}
      </View>
      {props.footer === undefined ? null : <ShellFooter>{props.footer}</ShellFooter>}
    </VariantProviders>
  );
}

export function PaneShell(props: VariantShellProps): ReactNode {
  return (
    <VariantProviders shell={props} head={false}>
      <View testID="shell-top" className="z-10 border-b border-outline-variant bg-chrome pt-safe">
        <BarRow shell={props} />
        <SearchRow shell={props} />
        {props.toolbar === undefined ? null : (
          <View testID="shell-toolbar" className="pb-2">
            {props.toolbar}
          </View>
        )}
      </View>
      <VariantBody shell={props} />
      {props.footer === undefined ? null : <ShellFooter>{props.footer}</ShellFooter>}
    </VariantProviders>
  );
}
