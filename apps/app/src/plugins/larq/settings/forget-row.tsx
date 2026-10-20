import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { forgetBottle } from '../../../api/bottles';
import { confirm } from '../../../components/confirm-store';
import { ActionRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useMutationState } from '../../../store/mutation';
import { Anchored } from './anchored';

export function ForgetList({
  deviceId,
  name,
}: {
  readonly deviceId: string;
  readonly name: string;
}): ReactNode {
  const router = useRouter();
  const { run } = useMutationState();
  const forget = (): void => {
    background(
      confirm({
        title: `Forget ${name}?`,
        body: 'Removes the bottle and its readings. Drinks already in the water log stay.',
        confirmLabel: 'Forget bottle',
        tone: 'destructive',
      }).then((accepted) => {
        if (accepted) {
          run(() => forgetBottle(deviceId), {
            failure: 'The bottle could not be forgotten',
            onDone: () => {
              router.replace(href.devices());
            },
          });
        }
      }),
      'bottle.forget_failed',
    );
  };
  return (
    <List inset footer="Removes the bottle and its readings. Drinks already in the water log stay.">
      <Anchored deviceId={deviceId} id="forget" label="Forget this bottle">
        <ActionRow icon="trash" title="Forget this bottle" destructive onPress={forget} />
      </Anchored>
    </List>
  );
}
