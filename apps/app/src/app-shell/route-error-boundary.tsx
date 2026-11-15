import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Logger, background } from '@smarteverything/logging';
import { useEffect } from 'react';
import { ErrorState } from '../components/error-state';
import { PageShell } from '../components/page-shell/page-shell';
import type { ShellSections } from '../components/page-shell/shell-sections';
import { ColourPalette } from '../design/colour-palette';
import { desktopBridge } from '../design/platform';

const log = new Logger('app.route');

export function RootRouteErrorBoundary(props: ErrorBoundaryProps): ReactNode {
  useEffect(() => {
    const desktop = desktopBridge();
    if (desktop?.reportWebBundleFailure !== undefined) {
      background(
        desktop.reportWebBundleFailure('The app could not render its first screen.'),
        'route_error_boundary.web_rollback_failed',
      );
    }
  }, []);
  return <RouteErrorBoundary {...props} />;
}

function CrashState({ error, retry }: ErrorBoundaryProps): ReactNode {
  useEffect(() => {
    log.exception('route.crashed', error);
  }, [error]);
  return (
    <ErrorState
      page
      error={error}
      retryLabel="Reload this page"
      retry={() => {
        background(retry(), 'route_error_boundary.retry_failed');
      }}
      secondary={{
        label: 'Go to Home',
        onPress: () => {
          router.replace('/');
          background(retry(), 'route_error_boundary.retry_failed');
        },
      }}
    />
  );
}

export function RouteErrorBoundary(props: ErrorBoundaryProps): ReactNode {
  return (
    <ColourPalette>
      <View className="flex-1 items-center justify-center bg-bg p-6">
        <CrashState {...props} />
      </View>
    </ColourPalette>
  );
}

export interface AreaCrashShell {
  readonly title: string;
  readonly back: boolean;
  readonly sections?: ShellSections;
}

export function AreaRouteErrorBoundary({
  title,
  back,
  sections,
  ...props
}: ErrorBoundaryProps & AreaCrashShell): ReactNode {
  return (
    <ColourPalette>
      <View className="flex-1 bg-bg">
        <PageShell title={title} back={back} {...(sections === undefined ? {} : { sections })}>
          <CrashState {...props} />
        </PageShell>
      </View>
    </ColourPalette>
  );
}
