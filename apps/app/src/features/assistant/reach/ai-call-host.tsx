import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AppState, Modal, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import type { AiOutreachRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { desktopBridge } from '../../../design/platform';
import { useSession } from '../../../store/selectors';
import { useSizeClass } from '../../../design/size-class';
import { useRingTone } from '../../cameras';
import { useAssistantName } from '../data/assistant-data';
import { declineOutreach, useOutreach } from './reach-data';

const log = new Logger('app.reach-ring');

function useRinging(): AiOutreachRow | null {
  const rows = useOutreach().data ?? [];
  const own = useSession().client.id;
  return rows.find((row) => row.state === 'ringing' && row.clients.includes(own)) ?? null;
}

function notifyInBackground(title: string, body: string): void {
  if (AppState.currentState === 'active') {
    return;
  }
  Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }).catch(
    (error: unknown) => {
      log.warn('reach.local_notification_failed', { reason: String(error) });
    },
  );
}

function useAttention(ringing: AiOutreachRow | null, name: string): void {
  const id = ringing?.id ?? null;
  const reason = ringing?.reason ?? '';
  useEffect(() => {
    const bridge = desktopBridge();
    if (id === null) {
      return;
    }
    if (bridge === null) {
      notifyInBackground(`${name} is calling`, reason);
      return;
    }
    bridge.attention?.().catch((error: unknown) => {
      log.warn('reach.attention_failed', { reason: String(error) });
    });
    bridge.notify({ title: `${name} is calling`, body: reason }).catch((error: unknown) => {
      log.warn('reach.notify_failed', { reason: String(error) });
    });
  }, [id, name, reason]);
}

function decline(ringing: AiOutreachRow): void {
  declineOutreach(ringing.id).catch((error: unknown) => {
    notify({ message: 'The call couldn’t be declined', error, tone: 'critical' });
  });
}

function Actions({ ringing }: { readonly ringing: AiOutreachRow }): ReactNode {
  const router = useRouter();
  return (
    <View className="w-full flex-row gap-3">
      <Button
        label="Decline"
        icon="phoneOff"
        variant="destructive"
        size="lg"
        grow
        onPress={() => {
          decline(ringing);
        }}
      />
      <Button
        label="Answer"
        icon="phone"
        size="lg"
        grow
        onPress={() => {
          router.navigate(href.assistantCall('assistant', ringing.chat_id, ringing.id));
        }}
      />
    </View>
  );
}

function Ringing({
  ringing,
  name,
}: {
  readonly ringing: AiOutreachRow;
  readonly name: string;
}): ReactNode {
  return (
    <>
      <View className="items-center gap-1">
        <View className="size-14 items-center justify-center rounded-full bg-primary-container">
          <Icon name="sparkles" size={24} tone="primary" />
        </View>
        <Text variant="title-2" align="center" accessibilityRole="header">
          {`${name} is calling`}
        </Text>
        <Text variant="callout" tone="variant" align="center">
          {ringing.reason}
        </Text>
      </View>
      <Actions ringing={ringing} />
    </>
  );
}

export function AiCallHost(): ReactNode {
  const ringing = useRinging();
  const name = useAssistantName();
  const touch = useSizeClass().idiom === 'touch';
  useAttention(ringing, name);
  useRingTone(ringing !== null);
  if (ringing === null) {
    return null;
  }
  if (touch) {
    return (
      <Modal
        visible
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          decline(ringing);
        }}
      >
        <View
          accessibilityLiveRegion="assertive"
          className="flex-1 justify-center gap-8 bg-bg px-gutter pb-safe-offset-6 pt-safe-offset-12"
        >
          <Ringing ringing={ringing} name={name} />
        </View>
      </Modal>
    );
  }
  return (
    <View
      accessibilityLiveRegion="assertive"
      className="absolute right-4 top-4 z-50 w-popover gap-4 rounded-xl border-hairline border-outline-variant bg-surface-raised p-card-pad elevation-3"
    >
      <Ringing ringing={ringing} name={name} />
    </View>
  );
}
