import { randomUUID } from 'expo-crypto';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Platform, StyleSheet } from 'react-native';
import { describe, expect, it } from 'vitest';

describe('the app unit test runtime', () => {
  it('loads react-native as an android platform', () => {
    expect(Platform.OS).toBe('android');
    expect(Platform.select({ android: 'a', native: 'n', default: 'd' })).toBe('a');
    expect(Platform.select({ native: 'n', default: 'd' })).toBe('n');
    expect(Platform.select({ default: 'd' })).toBe('d');
    expect(Platform.Version).toBe(35);
    expect(Platform.constants).toMatchObject({ Manufacturer: 'SmartEverything' });
    expect(StyleSheet.flatten([{ flex: 1 }, { margin: 2 }])).toEqual({ flex: 1, margin: 2 });
  });

  it('defines the development flag the expo packages read', () => {
    expect(__DEV__).toBe(true);
  });

  it('loads expo native module helpers without a native runtime', () => {
    expect(requireOptionalNativeModule('SmartEverythingMissingModule')).toBeNull();
  });

  it('resolves the web build of expo packages that have no node implementation', () => {
    expect(randomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('loads real app modules that sit on react-native, reanimated, gesture handler and uniwind', async () => {
    const sheet = await import('../components/bottom-sheet');
    const segmented = await import('../components/segmented');
    expect(sheet).toHaveProperty('BottomSheet');
    expect(segmented).toHaveProperty('Segmented');
  }, 30_000);

  it('exposes requireNativeView from expo as the real package does', () => {
    const View = requireNativeView<object>('Probe');
    expect(View).toBeTypeOf('function');
    expect(View.displayName).toBe('NativeView(Probe)');
  });

  it('loads the native browser surface that creates its native view at module scope', async () => {
    const browser = await import('../platform/browser-native');
    expect(browser).toHaveProperty('NativeBrowserSurface');
  }, 30_000);

  it('answers the expo-router hooks without a navigator', async () => {
    const {
      router,
      useRouter,
      useLocalSearchParams,
      useFocusEffect,
      Redirect,
      Stack,
      SplashScreen,
    } = await import('expo-router');
    expect(useRouter()).toBe(router);
    expect(useLocalSearchParams()).toEqual({});
    let ran = 0;
    useFocusEffect(() => {
      ran += 1;
    });
    expect(ran).toBe(1);
    expect(Redirect).toBeTypeOf('function');
    expect(Stack.Screen).toBeTypeOf('function');
    await expect(SplashScreen.hideAsync()).resolves.toBeUndefined();
  });

  it('answers the expo-router js-tabs without a navigator', async () => {
    const { Tabs } = await import('expo-router/js-tabs');
    expect(Tabs).toBeTypeOf('function');
    expect(Tabs.Screen).toBeTypeOf('function');
  });
});
