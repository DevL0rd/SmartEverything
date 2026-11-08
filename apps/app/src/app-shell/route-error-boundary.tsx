import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Logger, background } from '@smarteverything/logging';
import { useEffect } from 'react';
import { Button } from '../components/button';
import { ErrorState } from '../components/error-state';
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

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps): ReactNode {
  useEffect(() => {
    log.exception('route.crashed', error);
  }, [error]);
  return (
    <ColourPalette>
      <View className="flex-1 items-center justify-center gap-4 bg-bg p-6">
        <ErrorState
          page
          error={error}
          retryLabel="Reload this page"
          retry={() => {
            background(retry(), 'route_error_boundary.retry_failed');
          }}
        />
        <Button
          label="Go to Home"
          variant="text"
          onPress={() => {
            router.replace('/');
            background(retry(), 'route_error_boundary.retry_failed');
          }}
        />
      </View>
    </ColourPalette>
  );
}
