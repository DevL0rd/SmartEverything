import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { Button } from '../../components/button';
import { IconButton } from '../../components/icon-button';
import type { ConfirmRequest } from '../../components/confirm-store';
import { ListRow } from '../../components/list-row';
import type { ActionRow } from '../../components/rows';
import { confirmed } from './confirmed';
import { failureKind, pluginLog } from './plugin-log';
import { background } from '@smarteverything/logging';

let pressSequence = 0;

export interface PluginPress {
  readonly onPress: () => Promise<unknown>;
  readonly confirmation?: ConfirmRequest | undefined;
}

function runPress(input: {
  readonly onPress: () => Promise<unknown>;
  readonly press: number;
  readonly confirming: boolean;
  readonly onDone: () => void;
}): void {
  const { onPress, press, confirming, onDone } = input;
  const startedAt = Date.now();
  background(
    onPress()
      .then(
        () => {
          pluginLog.info('plugin_action.finished', {
            press,
            confirming,
            durationMs: Date.now() - startedAt,
          });
        },
        (error: unknown) => {
          pluginLog.warn('plugin_action.failed', {
            press,
            durationMs: Date.now() - startedAt,
            ...failureKind(error),
          });
          throw error;
        },
      )
      .finally(onDone),
    'press.on_failed',
  );
}

function usePluginPress({ onPress, confirmation }: PluginPress): {
  readonly busy: boolean;
  readonly press: () => void;
} {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    press: (): void => {
      if (busy) {
        return;
      }
      pressSequence += 1;
      const press = pressSequence;
      const confirming = confirmation !== undefined;
      pluginLog.debug('plugin_action.pressed', { press, confirming });
      background(
        confirmed(confirmation).then((accepted) => {
          if (!accepted) {
            pluginLog.debug('plugin_action.declined', { press });
            return;
          }
          setBusy(true);
          runPress({
            onPress,
            press,
            confirming,
            onDone: () => {
              setBusy(false);
            },
          });
        }),
        'plugin_action.confirmed_failed',
      );
    },
  };
}

export function PluginActionRow({
  onPress,
  confirmation,
  disabled = false,
  ...row
}: Omit<ComponentProps<typeof ActionRow>, 'onPress'> & PluginPress): ReactNode {
  const { busy, press } = usePluginPress({ onPress, confirmation });
  return (
    <ListRow
      {...row}
      disabled={disabled || busy}
      trailing={
        busy ? <ActivityIndicator size="small" colorClassName="accent-primary" /> : undefined
      }
      onPress={press}
    />
  );
}

export function PluginButton({
  onPress,
  confirmation,
  disabled = false,
  loading = false,
  ...button
}: Omit<ComponentProps<typeof Button>, 'onPress'> & PluginPress): ReactNode {
  const { busy, press } = usePluginPress({ onPress, confirmation });
  return <Button {...button} disabled={disabled} loading={loading || busy} onPress={press} />;
}

export function PluginIconButton({
  onPress,
  confirmation,
  disabled = false,
  ...button
}: Omit<ComponentProps<typeof IconButton>, 'onPress'> & PluginPress): ReactNode {
  const { busy, press } = usePluginPress({ onPress, confirmation });
  return <IconButton {...button} disabled={disabled || busy} onPress={press} />;
}
