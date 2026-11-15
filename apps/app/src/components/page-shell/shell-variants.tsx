import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import Head from 'expo-router/head';
import { cn } from '../../design/cn';
import { useIdiom } from '../../design/platform';
import { useScreenViewport } from '../../design/viewport';
import { EdgeScrim } from '../edge-scrim';
import { useBackAction } from '../back-navigation';
import { IconButton } from '../icon-button';
import { KeyboardViewport } from '../keyboard-viewport';
import { PrimaryAction, usePrimaryActionPlacement } from '../primary-action';
import { ScreenContext, type ScreenValue } from '../screen-context';
import type { VariantShellProps } from './shell-types';
import {
  BarInline,
  BarTrailing,
  OpenSearch,
  barOptionsOf,
  useBarSearch,
  useSearchOptionsPlace,
} from './bar-search';
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

function SearchOptionsRow({ shell }: { readonly shell: VariantShellProps }): ReactNode {
  const options = barOptionsOf(shell.search, useSearchOptionsPlace());
  if (options === undefined) return null;
  return (
    <View testID="shell-search-options" className="px-gutter pb-2">
      {options}
    </View>
  );
}

function BarRow({ shell }: { readonly shell: VariantShellProps }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const bar = useBarSearch(shell.search);
  const back = useBackPress(shell);
  const leading = shell.leading ?? [];
  const bare = back === null && leading.length === 0;
  if (shell.search !== undefined && bar.mode === 'open') {
    return (
      <View className="min-h-14 flex-row items-center px-1">
        <OpenSearch search={shell.search} onClose={bar.close} />
      </View>
    );
  }
  return (
    <View
      className={cn('min-h-14 flex-row items-center gap-1 pr-1', bare ? 'pl-gutter' : 'pl-1')}
      onLayout={(event) => {
        bar.onBar(event.nativeEvent.layout.width);
      }}
    >
      {back === null ? null : <ShellBack back={back} pointer={pointer} />}
      <LeadingActions actions={leading} />
      <View testID="shell-title" className={cn('min-w-0 flex-1 pr-1', bare ? null : 'pl-1')}>
        {shell.heading ?? <ShellTitle title={shell.title} size="bar" />}
      </View>
      <BarInline search={shell.search} bar={bar} />
      <BarTrailing search={shell.search} bar={bar}>
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
      </BarTrailing>
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

function OverlayTop({ shell }: { readonly shell: VariantShellProps }): ReactNode {
  return (
    <View testID="shell-top" className="absolute inset-x-0 top-0 pt-safe">
      <EdgeScrim edge="top" />
      <BarRow shell={shell} />
      <SearchOptionsRow shell={shell} />
      {shell.toolbar === undefined ? null : (
        <View testID="shell-toolbar" className="px-gutter pb-2">
          {shell.toolbar}
        </View>
      )}
    </View>
  );
}

export function OverlayShell(props: VariantShellProps): ReactNode {
  return (
    <VariantProviders shell={props} head>
      <VariantBody shell={props} />
      {props.bare === true ? null : <OverlayTop shell={props} />}
      {props.footer === undefined ? null : <ShellFooter>{props.footer}</ShellFooter>}
    </VariantProviders>
  );
}

export function PaneShell(props: VariantShellProps): ReactNode {
  return (
    <VariantProviders shell={props} head={false}>
      <View testID="shell-top" className="z-10 border-b border-outline-variant bg-chrome pt-safe">
        <BarRow shell={props} />
        <SearchOptionsRow shell={props} />
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
