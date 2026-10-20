import type { ReactNode } from 'react';
import { TV_KEY_REASON_TEXT } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import type { Television } from './use-television';

function powerLabel(tv: Television): string {
  const { mode, locks } = tv.view;
  if (mode === 'on') {
    return 'Turn off';
  }
  if (mode === 'turning_on') {
    return 'Turning on';
  }
  if (mode === 'updating') {
    return 'Power, the TV is updating';
  }
  return locks.power === undefined ? 'Turn on' : `Turn on, ${TV_KEY_REASON_TEXT[locks.power]}`;
}

export function PowerButton({ tv }: { readonly tv: Television }): ReactNode {
  const { mode, locks } = tv.view;
  return (
    <IconButton
      icon={mode === 'turning_on' ? 'loader' : 'power'}
      label={powerLabel(tv)}
      variant={mode === 'on' ? 'filled' : 'tonal'}
      disabled={locks.power !== undefined || mode === 'turning_on'}
      onPress={tv.togglePower}
    />
  );
}
