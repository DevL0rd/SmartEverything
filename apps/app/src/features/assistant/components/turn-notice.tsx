import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { AiChatRow, AiRetryFrom, AssistantMessageRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useIsOwner, useRow } from '../../../store/selectors';
import { useChatModel } from '../chats/chat-model';
import { useAiChat } from '../data/chat-store';
import { useRetryFrom } from '../data/retry';
import { retryMessage } from '../data/send';
import { failureCopy, type FailureAction } from '../model/failure-copy';
import type { NoticeSubject } from '../model/turn-notice';
import { background } from '@smarteverything/logging';

interface Names {
  readonly model: string | null;
  readonly switchable: boolean;
}

interface NoticeProps {
  readonly row: AssistantMessageRow;
  readonly subject: NoticeSubject;
}

const TOP_UP = href.settings.focus('assistant', 'assistant.openrouter.credit');

interface Handlers {
  readonly retries: Readonly<Record<RetryAction, (() => void) | null>>;
  readonly owner: boolean;
  readonly switchable: boolean;
}

type Variant = 'tonal' | 'outlined';
type RetryAction = 'retry' | 'regenerate' | 'continue';

const RETRY_LABEL = { retry: 'Try again', regenerate: 'Regenerate', continue: 'Continue' } as const;

function retryButton(action: RetryAction, variant: Variant, retry: (() => void) | null): ReactNode {
  return retry === null ? null : (
    <Button label={RETRY_LABEL[action]} icon="refresh" variant={variant} onPress={retry} />
  );
}

function buttonOf(action: FailureAction, variant: Variant, on: Handlers): ReactNode {
  switch (action) {
    case 'retry':
    case 'regenerate':
    case 'continue':
      return retryButton(action, variant, on.retries[action]);
    case 'top_up':
      return on.owner ? <Button label="Top up" variant={variant} href={TOP_UP} /> : null;
    case 'choose_model':
      return <Button label="Choose another model" variant={variant} onPress={openPanel('model')} />;
    case 'switch_machine':
      return on.switchable ? (
        <Button label="Switch machine" variant={variant} onPress={openPanel('device')} />
      ) : null;
  }
}

function openPanel(operation: 'model' | 'device'): () => void {
  return (): void => {
    router.setParams({ operation });
  };
}

function retryOf(
  request: AssistantMessageRow | null,
  from: AiRetryFrom | null,
): (() => void) | null {
  if (request === null || from === null) return null;
  return (): void => {
    background(retryMessage(request, from), 'message.retry_failed');
  };
}

function useHandlers(
  row: AssistantMessageRow,
  subject: NoticeSubject,
  switchable: boolean,
): Handlers {
  const replyTo = useRow('assistant_messages', subject === 'reply' ? row.reply_to : null);
  const request = subject === 'request' ? row : replyTo;
  const from = useRetryFrom(request);
  const owner = useIsOwner();
  const retry = retryOf(request, from);
  const resume = from === 'failed' ? retry : null;
  return {
    retries: { retry, regenerate: retry, continue: resume },
    owner,
    switchable,
  };
}

function Notice({ row, subject, model, switchable }: NoticeProps & Names): ReactNode {
  const spec = failureCopy(row.reason_code, { model, reason: row.reason });
  const handlers = useHandlers(row, subject, switchable);
  const critical = spec.tone === 'critical';
  const actions = spec.actions.map((action, index) => (
    <Fragment key={action}>
      {buttonOf(action, index === 0 ? 'tonal' : 'outlined', handlers)}
    </Fragment>
  ));
  if (!critical)
    return (
      <View className="flex-row flex-wrap items-center gap-2">
        <Icon name={spec.icon} size={16} tone="variant" />
        <Text variant="callout" tone="variant" className="min-w-0 shrink">
          {spec.body === null ? spec.title : `${spec.title} · ${spec.body}`}
        </Text>
        {actions}
      </View>
    );
  return (
    <Card tone="critical" className="gap-2">
      <View accessibilityRole="alert" className="gap-2">
        <View className="flex-row items-start gap-2">
          <Icon name={spec.icon} size={20} tone="critical" />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="body-strong">{spec.title}</Text>
            {spec.body === null ? null : (
              <Text variant="callout" tone="variant">
                {spec.body}
              </Text>
            )}
          </View>
        </View>
        <View className="flex-row flex-wrap gap-2">{actions}</View>
      </View>
    </Card>
  );
}

function ChatNotice({ chat, ...props }: NoticeProps & { readonly chat: AiChatRow }): ReactNode {
  const model = useChatModel(chat.engine);
  return (
    <Notice
      {...props}
      model={model.provider === null ? null : model.name}
      switchable={chat.engine.kind === 'dsh'}
    />
  );
}

export function TurnNotice(props: NoticeProps): ReactNode {
  const chat = useAiChat(props.row.chat_id);
  return chat === null ? (
    <Notice {...props} model={null} switchable={false} />
  ) : (
    <ChatNotice {...props} chat={chat} />
  );
}
