import type { ReactNode } from 'react';
import { ActionRow } from '../../components/rows';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { useAdGuardTools } from './adguard-data';

const CHOICES: readonly { readonly minutes: number; readonly title: string }[] = [
  { minutes: 15, title: 'For 15 minutes' },
  { minutes: 60, title: 'For 1 hour' },
  { minutes: 480, title: 'For 8 hours' },
  { minutes: 1440, title: 'For 24 hours' },
];

export function PauseSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const tools = useAdGuardTools();
  const run = (tool: string, args: Readonly<Record<string, unknown>>): void => {
    onClose();
    void tools.run(tool, args);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Pause ad blocking">
      <List>
        {CHOICES.map((choice) => (
          <ActionRow
            key={choice.minutes}
            title={choice.title}
            icon="timer"
            onPress={() => {
              run('pause_protection', { minutes: choice.minutes });
            }}
          />
        ))}
        <ActionRow
          title="Until I turn it back on"
          icon="shield"
          destructive
          onPress={() => {
            run('turn_off_protection', {});
          }}
        />
      </List>
    </Sheet>
  );
}
