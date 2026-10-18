import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AppState, Modal, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AiOutreachRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  assistantCallLinked,
  dismissIncomingCall,
  ringIncomingCall,
  type IncomingCallRing,
} from '../../../../modules/health-connect';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { desktopBridge } from '../../../design/platform';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { useSizeClass } from '../../../design/size-class';
import { useRingTone } from '../../cameras';
import { useAssistantName } from '../data/assistant-data';
import { declineOutreach, useOutreach, useRefreshOutreach } from './reach-data';

const log = new Logger('app.reach-ring');

const selectClientId = (state: StoreState): string | null => state.session?.client.id ?? null;

function useRinging(): AiOutreachRow | null {
  const rows = useOutreach().data ?? [];
  const own = useStoreSelector(selectClientId);
  return (
    rows.find((row) => row.state === 'ringing' && own !== null && row.clients.includes(own)) ?? null
  );
}

function callOf(
  ringing: Pick<AiOutreachRow, 'id' | 'chat_id' | 'reason' | 'expires_at'>,
  name: string,
): IncomingCallRing | null {
  if (ringing.chat_id === null || ringing.expires_at === null) {
    log.warn('reach.native_ring_incomplete', { outreachId: ringing.id });
    return null;
  }
  return {
    caller: name,
    outreachId: ringing.id,
    chatId: ringing.chat_id,
    reason: ringing.reason,
    expiresAt: ringing.expires_at,
  };
}

function ringNatively(call: IncomingCallRing): void {
  if (!assistantCallLinked()) {
    return;
  }
  ringIncomingCall(call).catch((error: unknown) => {
    log.warn('reach.native_ring_failed', { outreachId: call.outreachId, reason: String(error) });
  });
}

function dismissNatively(outreachId: string): void {
  if (!assistantCallLinked()) {
    return;
  }
  dismissIncomingCall(outreachId).catch((error: unknown) => {
    log.warn('reach.native_dismiss_failed', { outreachId, reason: String(error) });
  });
}

function useNativeRing(ringing: AiOutreachRow | null, name: string): void {
  const id = ringing?.id ?? null;
  const chatId = ringing?.chat_id ?? null;
  const reason = ringing?.reason ?? '';
  const expiresAt = ringing?.expires_at ?? null;
  useEffect(() => {
    if (id === null || desktopBridge() !== null) {
      return undefined;
    }
    const call = callOf({ id, chat_id: chatId, reason, expires_at: expiresAt }, name);
    if (call === null) {
      return undefined;
    }
    log.info('reach.ringing_seen', { outreachId: id, appState: AppState.currentState });
    if (AppState.currentState !== 'active') {
      ringNatively(call);
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        dismissNatively(id);
      } else {
        ringNatively(call);
      }
    });
    return (): void => {
      subscription.remove();
      dismissNatively(id);
    };
  }, [id, chatId, reason, expiresAt, name]);
}

function useDesktopAttention(ringing: AiOutreachRow | null, name: string): void {
  const id = ringing?.id ?? null;
  const reason = ringing?.reason ?? '';
  useEffect(() => {
    const bridge = desktopBridge();
    if (id === null || bridge === null) {
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

function useRefreshOnResume(): void {
  const refresh = useRefreshOutreach();
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return (): void => {
      subscription.remove();
    };
  }, [refresh]);
}

function decline(ringing: AiOutreachRow): void {
  dismissNatively(ringing.id);
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
          dismissNatively(ringing.id);
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
  useDesktopAttention(ringing, name);
  useNativeRing(ringing, name);
  useRefreshOnResume();
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
