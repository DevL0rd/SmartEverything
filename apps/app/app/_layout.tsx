import type { ReactNode } from 'react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { startLogging } from '../src/platform/logging';
import { provideRandomValues } from '../src/platform/random-values';
import { APP_FONTS } from '../src/design/fonts';
import { isNative } from '../src/design/platform';
import { AppRoot } from '../src/features/root/app-root';
import { FontFailure } from '../src/features/root/font-failure';
import '../global.css';

const SEE_THROUGH = { ...DarkTheme, colors: { ...DarkTheme.colors, background: 'transparent' } };

startLogging();
provideRandomValues();

export default function RootLayout(): ReactNode {
  const [loaded, failure] = useFonts(APP_FONTS);
  if (failure !== null) {
    return <FontFailure reason={failure.message} />;
  }
  if (!loaded) {
    return null;
  }
  return (
    <AppRoot>
      <Head>
        <title>SmartEverything</title>
      </Head>
      <StatusBar style="auto" />
      <ThemeProvider value={SEE_THROUGH}>
        <Stack screenOptions={{ headerShown: false, animation: isNative() ? 'default' : 'fade' }}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="pair" />
          <Stack.Screen
            name="search"
            options={{ presentation: isNative() ? 'fullScreenModal' : 'card' }}
          />
          <Stack.Screen
            name="(flows)"
            options={{
              presentation: isNative() ? 'modal' : 'transparentModal',
              animation: isNative() ? 'slide_from_bottom' : 'fade',
            }}
          />
        </Stack>
      </ThemeProvider>
    </AppRoot>
  );
}
