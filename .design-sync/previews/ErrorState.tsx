import type { ReactElement } from 'react';
import { ErrorState, Stage } from 'smarteverything-kit';

export const Retry = (): ReactElement => (
  <Stage theme="dark" width={460}>
    <ErrorState error={new Error('The hub did not answer in time')} retry={() => undefined} />
  </Stage>
);
export const NoRetry = (): ReactElement => (
  <Stage theme="dark" width={460}>
    <ErrorState error={new Error('You do not have access to this room')} />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={460}>
    <ErrorState
      error={new Error('The hub did not answer in time')}
      retry={() => undefined}
      retryLabel="Try again"
    />
  </Stage>
);
