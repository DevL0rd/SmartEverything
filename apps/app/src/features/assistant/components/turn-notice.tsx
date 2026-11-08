import { Fragment, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { clock } from '../../../format/time';
import { useIsOwner, useRow } from '../../../store/selectors';
import { useChatModel } from '../chats/chat-model';
import { useAiChat } from '../data/chat-store';
import { useCanContinue } from '../data/retry';
import { continueMessage } from '../data/send';
import { failureCopy, type FailureAction, type FailureCopy } from '../model/failure-copy';
import { actionLabelOf } from '../model/turn-notice';
import { useTimeZone } from './message-parts';

interface Names {
  readonly model: string | null;
  readonly switchable: boolean;
  readonly native: boolean;
}

interface NoticeProps {
  readonly row: AssistantMessageRow;
}

interface Handlers {
  readonly resume: (() => void) | null;
  readonly owner: boolean;
  readonly switchable: boolean;
  readonly details: () => void;
}

const TOP_UP = href.settings.focus('assistant', 'assistant.openrouter.credit');

const HIT = 8;

const GLYPH_TONE: Readonly<Record<FailureCopy['tone'], Tone>> = {
  critical: 'critical',
  warning: 'warning',
  variant: 'variant',
};

function openPanel(operation: 'model' | 'device'): () => void {
  return (): void => {
    router.setParams({ operation });
  };
}

function resumeOf(request: AssistantMessageRow | null): (() => void) | null {
  if (request?.state !== 'failed') return null;
  return (): void => {
    background(continueMessage(request), 'message.continue_failed');
  };
}

function useHandlers(row: AssistantMessageRow, switchable: boolean, details: () => void): Handlers {
  const request = useRow('assistant_messages', row.reply_to);
  const continuable = useCanContinue(request);
  const owner = useIsOwner();
  return { resume: continuable ? resumeOf(request) : null, owner, switchable, details };
}

type Press = { readonly onPress: () => void } | { readonly href: typeof TOP_UP };

function pressOf(action: FailureAction, on: Handlers): Press | null {
  switch (action) {
    case 'continue':
      return on.resume === null ? null : { onPress: on.resume };
    case 'top_up':
      return on.owner ? { href: TOP_UP } : null;
    case 'choose_model':
      return { onPress: openPanel('model') };
    case 'machine_switch':
      return on.switchable ? { onPress: openPanel('device') } : null;
    case 'details':
      return { onPress: on.details };
  }
}

function NoticeAction({
  label,
  press,
  primary,
}: {
  readonly label: string;
  readonly press: Press;
  readonly primary: boolean;
}): ReactNode {
  return (
    <Interactive
      label={label}
      {...press}
      hitSlop={HIT}
      className="h-5 justify-center"
      layerClassName="rounded-sm"
    >
      <Text
        variant="footnote"
        tone={primary ? 'primary' : 'default'}
        numberOfLines={1}
        className="font-sans-medium"
      >
        {label}
      </Text>
    </Interactive>
  );
}

function NoticeActions({
  spec,
  on,
}: {
  readonly spec: FailureCopy;
  readonly on: Handlers;
}): ReactNode {
  const shown = spec.actions.flatMap((action) => {
    const press = pressOf(action, on);
    return press === null ? [] : [{ action, press }];
  });
  if (shown.length === 0) return null;
  return (
    <View className="flex-row items-center gap-1.5">
      {shown.map(({ action, press }, index) => (
        <Fragment key={action}>
          {index === 0 ? null : (
            <Text variant="footnote" tone="faint" aria-hidden>
              ·
            </Text>
          )}
          <NoticeAction
            label={actionLabelOf(action, spec.tone)}
            press={press}
            primary={index === 0}
          />
        </Fragment>
      ))}
    </View>
  );
}

function NoticeDetails({
  spec,
  open,
  onClose,
}: {
  readonly spec: FailureCopy;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title={spec.title} detents={['fit']}>
      <Text variant="callout" tone="variant" selectable>
        {spec.detail ?? ''}
      </Text>
    </Sheet>
  );
}

function useDetailsSheet(): {
  readonly open: boolean;
  readonly mounted: boolean;
  readonly show: () => void;
  readonly hide: () => void;
} {
  const [state, setState] = useState({ open: false, mounted: false });
  return {
    ...state,
    show: (): void => {
      setState({ open: true, mounted: true });
    },
    hide: (): void => {
      setState((current) => ({ ...current, open: false }));
    },
  };
}

function Notice({ row, model, switchable, native }: NoticeProps & Names): ReactNode {
  const spec = failureCopy(row.reason_code, { model, reason: row.reason, native });
  const sheet = useDetailsSheet();
  const handlers = useHandlers(row, switchable, sheet.show);
  const time = clock(row.updated_at, useTimeZone());
  return (
    <View
      accessibilityRole={spec.tone === 'critical' ? 'alert' : 'text'}
      className="min-h-5 w-full flex-row flex-wrap items-center gap-x-1.5"
    >
      <Icon name={spec.icon} size={16} tone={GLYPH_TONE[spec.tone]} />
      <Text variant="footnote" tone="variant" className="min-w-0 shrink">
        {spec.title}
      </Text>
      <View className="grow flex-row items-center gap-1.5">
        <NoticeActions spec={spec} on={handlers} />
        <Text variant="caption" tone="faint" numberOfLines={1} className="tabular ml-auto pl-1.5">
          {time}
        </Text>
      </View>
      {sheet.mounted ? <NoticeDetails spec={spec} open={sheet.open} onClose={sheet.hide} /> : null}
    </View>
  );
}

function ChatNotice({ chat, ...props }: NoticeProps & { readonly chat: AiChatRow }): ReactNode {
  const model = useChatModel(chat.engine);
  return (
    <Notice
      {...props}
      model={model.provider === null ? null : model.name}
      switchable={chat.engine.kind === 'dsh'}
      native={chat.engine.kind !== 'dsh'}
    />
  );
}

export function TurnNotice(props: NoticeProps): ReactNode {
  const chat = useAiChat(props.row.chat_id);
  return chat === null ? (
    <Notice {...props} model={null} switchable={false} native={false} />
  ) : (
    <ChatNotice {...props} chat={chat} />
  );
}
