import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useSettingsOrigin } from '../app-shell/settings-navigation';
import { isNative } from '../design/platform';
import { settingsIdOfRoute } from './mounts';
import { pageHref, settingsPage } from './tree';

interface RouteEntry {
  readonly name: string;
  readonly params?: object | undefined;
}

function paramOf(params: object | undefined, key: string): string {
  const value: unknown = params === undefined ? undefined : Reflect.get(params, key);
  if (Array.isArray(value)) {
    return value.map(String).join('/');
  }
  return typeof value === 'string' ? value : '';
}

export function routeSettingsId(route: RouteEntry, base: string): string | null {
  const path = route.name
    .replace(/\[\.\.\.(\w+)\]/g, (_, key: string) => paramOf(route.params, key))
    .replace(/\[(\w+)\]/g, (_, key: string) => paramOf(route.params, key))
    .replace(/(^|\/)index$/, '');
  return settingsIdOfRoute([base, path].filter((part) => part !== '').join('/'));
}

function previousRoute(state: {
  readonly index: number;
  readonly routes: readonly RouteEntry[];
}): RouteEntry | undefined {
  return state.routes[state.index - 1];
}

export function useSettingsParentBack(page: string): void {
  const navigation = useNavigation();
  const origin = useSettingsOrigin();
  const parent = settingsPage(page)?.parent ?? null;
  useFocusEffect(
    useCallback(() => {
      const definition = parent === null ? undefined : settingsPage(parent);
      if (!isNative() || definition === undefined) {
        return undefined;
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        const state = navigation.getState();
        const previous = state === undefined ? undefined : previousRoute(state);
        if (origin && previous === undefined) return false;
        if (
          previous !== undefined &&
          keepsSettingsHistory(page, routeSettingsId(previous, 'settings'), definition.id)
        ) {
          return false;
        }
        router.replace(pageHref(definition));
        return true;
      });
      return (): void => {
        subscription.remove();
      };
    }, [navigation, parent, origin, page]),
  );
}

function keepsSettingsHistory(page: string, previous: string | null, parent: string): boolean {
  return previous === parent || (page.endsWith('/detail') && previous === `${parent}/add`);
}
