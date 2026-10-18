import { useEffect } from 'react';
import { ConfirmHost, GlobalTheme, Stage, confirm } from 'smarteverything-kit';

function Ask({ theme }: { theme: 'dark' | 'light' }) {
  useEffect(() => {
    void confirm({
      title: 'Remove Living room lamp?',
      body: 'Its history and automations will be removed from this home.',
      confirmLabel: 'Remove device',
      tone: 'destructive',
    });
  }, []);
  return (
    <GlobalTheme theme={theme}>
      <Stage theme={theme}>
        <ConfirmHost />
      </Stage>
    </GlobalTheme>
  );
}
export const Dark = () => <Ask theme="dark" />;
export const Light = () => <Ask theme="light" />;
