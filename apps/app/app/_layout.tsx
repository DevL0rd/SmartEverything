import type { ReactNode } from 'react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Logger } from '@smarteverything/logging';
import { installCrashGuard } from '../src/platform/crash-guard';
import { restoreTrail } from '../src/platform/crash-trail';
import { startLogging } from '../src/platform/logging';
import { provideRandomValues } from '../src/platform/random-values';
import { APP_FONTS } from '../src/design/fonts';
import { isNative } from '../src/design/platform';
import { AppRoot } from '../src/features/root/app-root';
import { CrashTrailHost } from '../src/features/root/crash-trail-host';
import { FontFailure } from '../src/features/root/font-failure';
import { startDeveloper } from '../src/developer/boot';
import { useDeveloperFlags } from '../src/developer/flags';
import { startPerf } from '../src/perf/install';
import { PerfHost } from '../src/perf/perf-host';
import { probedScreen } from '../src/perf/screen-probe';
import '../global.css';

const SEE_THROUGH = { ...DarkTheme, colors: { ...DarkTheme.colors, background: 'transparent' } };

startLogging();
installCrashGuard();
startDeveloper()
  .then(startPerf)
  .catch((error: unknown) => {
    new Logger('app.developer').warn('developer.not_started', { reason: String(error) });
  });
provideRandomValues();
restoreTrail().catch((error: unknown) => {
  new Logger('app.crash-trail').warn('trail.not_restored', { reason: String(error) });
});

export { RouteErrorBoundary as ErrorBoundary } from '../src/app-shell/route-error-boundary';

export default function RootLayout(): ReactNode {
  const [loaded, failure] = useFonts(APP_FONTS);
  const flags = useDeveloperFlags();
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
      <CrashTrailHost />
      {flags['perf.sampling'] ? <PerfHost /> : null}
      <ThemeProvider value={SEE_THROUGH}>
        <Stack
          screenLayout={probedScreen}
          screenOptions={{ headerShown: false, animation: isNative() ? 'default' : 'fade' }}
        >
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
