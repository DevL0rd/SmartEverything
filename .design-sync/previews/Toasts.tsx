import { useEffect } from 'react';
import { GlobalTheme, Stage, Toasts, notify } from 'smarteverything-kit';

function Fire({ theme }: { theme: 'dark' | 'light' }) {
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
export const Dark = () => <Fire theme="dark" />;
export const Light = () => <Fire theme="light" />;
