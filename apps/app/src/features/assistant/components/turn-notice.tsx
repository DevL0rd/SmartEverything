import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useRow } from '../../../store/selectors';
import { changeChat } from '../chats/chat-actions';
import { ChatModelPicker } from '../chats/chat-model-picker';
import { useAiChat } from '../data/chat-store';
import { useRetryFrom } from '../data/retry';
import { retryMessage } from '../data/send';
import {
  noticeOf,
  type NoticeAction,
  type NoticeSpec,
  type NoticeSubject,
} from '../model/turn-notice';

function ModelChoice({
  chatId,
  open,
  onClose,
}: {
  readonly chatId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const chat = useAiChat(chatId);
  if (chat === null) {
    return null;
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Model and thinking"
      detents={['full']}
      scroll={false}
    >
      <ChatModelPicker
        engine={chat.engine}
        onChange={(engine) => {
          void changeChat(chat.id, { engine });
        }}
      />
    </Sheet>
  );
}

function useRetry(request: AssistantMessageRow | null): (() => void) | null {
  const from = useRetryFrom(request);
  if (request === null || from === null) {
    return null;
  }
  return (): void => {
    void retryMessage(request, from);
  };
}

interface ActionButtonsProps {
  readonly actions: readonly NoticeAction[];
  readonly retry: (() => void) | null;
  readonly chooseModel: () => void;
}

function ActionButtons({ actions, retry, chooseModel }: ActionButtonsProps): ReactNode {
  return (
    <View className="-ml-3 flex-row flex-wrap gap-1 pt-1">
      {actions.map((action) => {
        switch (action) {
          case 'retry':
            return retry === null ? null : (
              <Button
                key={action}
                label="Try again"
                icon="refresh"
                variant="tonal"
                onPress={retry}
              />
            );
          case 'regenerate':
            return retry === null ? null : (
              <Button
                key={action}
                label="Regenerate"
                icon="refresh"
                variant="text"
                onPress={retry}
              />
            );
          case 'open-credits':
            return (
              <Button
                key={action}
                label="Add credits"
                variant="text"
                onPress={() => {
                  router.push(href.assistantCosts());
                }}
              />
            );
          case 'choose-model':
            return (
              <Button key={action} label="Choose model" variant="tonal" onPress={chooseModel} />
            );
        }
      })}
    </View>
  );
}

function InlineNotice({
  spec,
  retry,
}: {
  readonly spec: NoticeSpec;
  readonly retry: (() => void) | null;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2">
      <Icon name={spec.icon} size={16} tone="variant" />
      <Text variant="footnote" tone="variant">
        {spec.title}
      </Text>
      {retry === null ? null : (
        <Button label="Regenerate" icon="refresh" variant="text" onPress={retry} />
      )}
    </View>
  );
}

function NoticeCard({
  spec,
  retry,
  chooseModel,
}: {
  readonly spec: NoticeSpec;
  readonly retry: (() => void) | null;
  readonly chooseModel: () => void;
}): ReactNode {
  const critical = spec.tone === 'critical';
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'flex-row gap-3 rounded-lg px-3.5 pb-2 pt-3',
        critical ? 'bg-critical/12' : 'bg-surface-2',
      )}
    >
      <View className="pt-0.5">
        <Icon name={spec.icon} size={20} tone={critical ? 'critical' : 'variant'} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="callout" className="font-sans-medium">
          {spec.title}
        </Text>
        {spec.body === null ? null : (
          <Text variant="footnote" tone="variant">
            {spec.body}
          </Text>
        )}
        <ActionButtons actions={spec.actions} retry={retry} chooseModel={chooseModel} />
      </View>
    </View>
  );
}

export function TurnNotice({
  row,
  subject,
}: {
  readonly row: AssistantMessageRow;
  readonly subject: NoticeSubject;
}): ReactNode {
  const [choosing, setChoosing] = useState(false);
  const replyTo = useRow('assistant_messages', subject === 'reply' ? row.reply_to : null);
  const retry = useRetry(subject === 'request' ? row : replyTo);
  const spec = noticeOf(row.reason_code, row.reason, subject);
  if (spec.inline) {
    return <InlineNotice spec={spec} retry={retry} />;
  }
  return (
    <>
      <NoticeCard
        spec={spec}
        retry={retry}
        chooseModel={() => {
          setChoosing(true);
        }}
      />
      <ModelChoice
        chatId={row.chat_id}
        open={choosing}
        onClose={() => {
          setChoosing(false);
        }}
      />
    </>
  );
}
