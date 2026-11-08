import { type ReactElement, useEffect } from 'react';
import { GlobalTheme, Stage, Toasts, notify } from 'smarteverything-kit';

function Fire({ theme }: { theme: 'dark' | 'light' }): ReactElement {
  useEffect(() => {
    notify({
      message: 'Scene saved',
      detail: 'Evening lights will run at sunset',
      tone: 'positive',
    });
  }, []);
  return (
    <GlobalTheme theme={theme}>
      <Stage theme={theme} width={560} height={420}>
        <Toasts />
      </Stage>
    </GlobalTheme>
  );
}
export const Dark = (): ReactElement => <Fire theme="dark" />;
export const Light = (): ReactElement => <Fire theme="light" />;
