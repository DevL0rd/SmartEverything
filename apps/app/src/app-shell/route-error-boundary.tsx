import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Logger, background } from '@smarteverything/logging';
import { useEffect } from 'react';
import { Button } from '../components/button';
import { ErrorState } from '../components/error-state';
import { ColourPalette } from '../design/colour-palette';

const log = new Logger('app.route');

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
