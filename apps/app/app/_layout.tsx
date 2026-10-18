import type { ReactNode } from 'react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Logger } from '@smarteverything/logging';
import { installCrashGuard } from '../src/platform/crash-guard';
import { restoreTrail } from '../src/platform/crash-trail';
import { startLogging } from '../src/platform/logging';
import { provideRandomValues } from '../src/platform/random-values';
import { APP_FONTS } from '../src/design/fonts';
import { FLOWS_PRESENTATION, SEARCH_PRESENTATION } from '../src/app-shell/root-presentation';
import { isNative } from '../src/design/platform';
import { AppRoot } from '../src/features/root/app-root';
import { CrashTrailHost } from '../src/features/root/crash-trail-host';
import { FontFailure } from '../src/features/root/font-failure';
import { StartupPending } from '../src/features/root/startup-pending';
import { startDeveloper } from '../src/developer/boot';
import { useDeveloperFlag } from '../src/developer/flags';
import { startPerf } from '../src/perf/install';
import { PerfHost } from '../src/perf/perf-host';
import { probedScreen } from '../src/perf/screen-probe';
import { ProfilingHost, RootProfiler } from '../src/dev/profiling-host';
import '../global.css';

const ROOT_OPTIONS = { headerShown: false, animation: isNative() ? 'default' : 'fade' } as const;

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

function SamplingHost(): ReactNode {
  return useDeveloperFlag('perf.sampling') ? <PerfHost /> : null;
}

export default function RootLayout(): ReactNode {
  const [loaded, failure] = useFonts(APP_FONTS);
  if (failure !== null) {
    return <FontFailure reason={failure.message} />;
  }
  if (!loaded) {
    return <StartupPending stage="loading the app fonts" />;
  }
  return (
    <AppRoot>
      <Head>
        <title>SmartEverything</title>
      </Head>
      <StatusBar style="auto" />
      <CrashTrailHost />
      <SamplingHost />
      {__DEV__ ? <ProfilingHost /> : null}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <ThemeProvider value={SEE_THROUGH}>
          <RootProfiler>
            <Stack screenLayout={probedScreen} screenOptions={ROOT_OPTIONS}>
              <Stack.Screen name="(app)" />
              <Stack.Screen name="pair" />
              <Stack.Screen name="search" options={{ presentation: SEARCH_PRESENTATION }} />
              <Stack.Screen
                name="(flows)"
                options={{
                  presentation: FLOWS_PRESENTATION,
                  animation: isNative() ? 'slide_from_bottom' : 'fade',
                }}
              />
            </Stack>
          </RootProfiler>
        </ThemeProvider>
      </KeyboardProvider>
    </AppRoot>
  );
}
