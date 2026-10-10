import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { useEffect } from 'react';
import { ErrorState } from '../components/error-state';

const log = new Logger('app.route');

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps): ReactNode {
  useEffect(() => {
    log.error('route.crashed', error);
  }, [error]);
  return (
    <View className="flex-1 items-center justify-center bg-bg p-6">
      <ErrorState
        page
        error={error}
        retryLabel="Reload this page"
        retry={() => {
          void retry();
        }}
      />
    </View>
  );
}
