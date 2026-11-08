import type { ComponentProps, ReactElement } from 'react';
import { GlobalTheme, LiftMenu, Stage, StatTile } from 'smarteverything-kit';

const item = (
  label: string,
  icon: 'customize' | 'home' | 'close' | 'upload',
  extra = {},
): ComponentProps<typeof LiftMenu>['entries'][number] => ({
  kind: 'item' as const,
  item: { label, icon, onPress: (): void => undefined, ...extra },
});
const quick = [
  { label: 'Pin', icon: 'sparkles' as const, onPress: (): void => undefined },
  { label: 'Share', icon: 'upload' as const, onPress: (): void => undefined },
];
const entries = [
  item('Rename', 'customize'),
  item('Move to room', 'home'),
  { kind: 'divider' as const, key: 'd' },
  item('Remove', 'close', { destructive: true }),
];
const preview = <StatTile label="Temperature" value="21.5" unit="C" caption="Living room" />;
export const Dark = (): ReactElement => (
  <Stage theme="dark">
    <LiftMenu
      label="Tile menu"
      preview={preview}
      previewAlign="start"
      quick={quick}
      entries={entries}
      onClose={() => undefined}
    />
  </Stage>
);
export const Light = (): ReactElement => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <LiftMenu
        label="Tile menu"
        preview={preview}
        previewAlign="start"
        quick={quick}
        entries={entries}
        onClose={() => undefined}
      />
    </Stage>
  </GlobalTheme>
);
