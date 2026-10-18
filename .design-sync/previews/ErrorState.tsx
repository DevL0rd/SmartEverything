import { ErrorState, Stage } from 'smarteverything-kit';

export const Retry = () => (
  <Stage theme="dark" width={460}>
    <ErrorState error={new Error('The hub did not answer in time')} retry={() => undefined} />
  </Stage>
);
export const NoRetry = () => (
  <Stage theme="dark" width={460}>
    <ErrorState error={new Error('You do not have access to this room')} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    <ErrorState
      error={new Error('The hub did not answer in time')}
      retry={() => undefined}
      retryLabel="Try again"
    />
  </Stage>
);
