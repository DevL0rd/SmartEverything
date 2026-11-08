import { background } from '@smarteverything/logging';
import { useEffect, type ReactElement } from 'react';
import { ConfirmHost, GlobalTheme, Stage, confirm } from 'smarteverything-kit';

function Ask({ theme }: { theme: 'dark' | 'light' }): ReactElement {
  useEffect(() => {
    background(
      confirm({
        title: 'Remove Living room lamp?',
        body: 'Its history and automations will be removed from this home.',
        confirmLabel: 'Remove device',
        tone: 'destructive',
      }),
      'preview.confirm_failed',
    );
  }, []);
  return (
    <GlobalTheme theme={theme}>
      <Stage theme={theme}>
        <ConfirmHost />
      </Stage>
    </GlobalTheme>
  );
}
export const Dark = (): ReactElement => <Ask theme="dark" />;
export const Light = (): ReactElement => <Ask theme="light" />;
