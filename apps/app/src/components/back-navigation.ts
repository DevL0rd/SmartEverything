import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { router, useFocusEffect, usePathname, useNavigation, useRoute } from 'expo-router';
import type { AppHref } from './app-href';

export type AppPath = Extract<AppHref, string>;

export interface BackOpener {
  readonly key: string;
  readonly href: AppPath;
}

export type BackStep =
  | { readonly kind: 'parent'; readonly parent: AppHref }
  | { readonly kind: 'caller'; readonly opener: BackOpener; readonly parent: AppHref | null };

export type BackOutcome = 'opener' | 'parent';

export interface BackRules {
  readonly stepFor: (pathname: string, opener: BackOpener | null) => BackStep | null;
  readonly callerOf: (key: string, pathname: string) => BackOpener | null;
  readonly isLive: (key: string) => boolean;
  readonly returned: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export class MissingBackRulesError extends Error {
  constructor() {
    super('A page header needs the back rules; mount BackRulesProvider above every route.');
    this.name = 'MissingBackRulesError';
  }
}

const BackRulesContext = createContext<BackRules | null>(null);

export const BackRulesProvider = BackRulesContext.Provider;

let active: (() => BackOutcome | null) | null = null;

function claimBack(action: () => BackOutcome | null): () => void {
  active = action;
  return (): void => {
    if (active === action) active = null;
  };
}

export function runBack(): BackOutcome | null {
  return active === null ? null : active();
}

export interface BackNavigation {
  readonly getState: () =>
    { readonly type: string; readonly routes: readonly { readonly key: string }[] } | undefined;
  readonly goBack: () => void;
}

function openerIsBelow(navigation: BackNavigation, routeKey: string, opener: BackOpener): boolean {
  const state = navigation.getState();
  if (state?.type !== 'stack') return false;
  const at = state.routes.findIndex((route) => route.key === routeKey);
  return at > 0 && state.routes[at - 1]?.key === opener.key;
}

export function leave(
  step: BackStep,
  navigation: BackNavigation,
  routeKey: string,
  rules: Pick<BackRules, 'isLive' | 'returned'>,
): BackOutcome | null {
  if (step.kind === 'caller' && openerIsBelow(navigation, routeKey, step.opener)) {
    rules.returned();
    navigation.goBack();
    return 'opener';
  }
  if (step.kind === 'caller' && rules.isLive(step.opener.key)) {
    rules.returned();
    router.dismissTo(step.opener.href);
    return 'opener';
  }
  if (step.parent === null) return null;
  rules.returned();
  router.dismissTo(step.parent);
  return 'parent';
}

function useRules(): BackRules {
  const rules = useContext(BackRulesContext);
  if (rules === null) throw new MissingBackRulesError();
  return rules;
}

export function useBackAction(enabled: boolean): (() => BackOutcome | null) | null {
  const rules = useRules();
  const navigation = useNavigation();
  const pathname = usePathname();
  const { key } = useRoute();
  const opener = useSyncExternalStore(rules.subscribe, () => rules.callerOf(key, pathname));
  const step = enabled ? rules.stepFor(pathname, opener) : null;
  const action =
    step === null ? null : (): BackOutcome | null => leave(step, navigation, key, rules);
  const latest = useRef(action);
  useEffect(() => {
    latest.current = action;
  });
  const shown = action !== null;
  useFocusEffect(
    useCallback(() => (shown ? claimBack(() => latest.current?.() ?? null) : undefined), [shown]),
  );
  return action;
}
