import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { useHasScale } from '../../profiles';
import { useWriteState } from '../../profiles';

export function ScaleWritesRow(): ReactNode {
  const state = useWriteState();
  const scale = useHasScale();
  if (!scale) {
    return null;
  }
  const subtitle =
    state.kind === 'ready'
      ? 'Saved after each weigh-in'
      : state.kind === 'needs_permission'
        ? `Review Health Connect access above · ${String(state.waiting)} waiting`
        : state.reason;
  return (
    <ListRow
      icon="scale"
      title="Save weigh-ins to Health Connect"
      subtitle={subtitle}
      subtitleTone={state.kind === 'ready' ? 'variant' : 'warning'}
      {...(state.kind === 'needs_permission'
        ? { href: href.settings.focus('health', 'health-connect'), chevron: true }
        : {})}
    />
  );
}
