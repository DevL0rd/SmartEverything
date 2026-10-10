import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  ENGINE_KINDS,
  ENGINE_LABELS,
  type AssistantStatus,
  type EngineKind,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { BrandMark } from '../../../components/brand-mark';
import type { Brand } from '../../../components/brand-glyphs';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIsOwner } from '../../../store/selectors';
import { useAssistantStatus } from '../data/assistant-data';
import { costText } from '../data/cost';
import { useOpenRouterAccount, useOpenRouterStatus } from '../data/openrouter';
import { useResponderActions } from '../data/responder-actions';
import { appText } from '../data/responder-view';

interface BackendEntry {
  readonly brand: Brand;
  readonly page: string;
  readonly app: 'claude-code' | 'codex' | null;
}

export const BACKENDS: Readonly<Record<EngineKind, BackendEntry>> = {
  openrouter: { brand: 'openrouter', page: 'assistant/openrouter', app: null },
  'claude-session': { brand: 'claude-code', page: 'assistant/claude-code', app: 'claude-code' },
  'codex-thread': { brand: 'chatgpt', page: 'assistant/codex', app: 'codex' },
};

function useOpenRouterLine(): string {
  const status = useOpenRouterStatus();
  const keySet = status.data?.key === 'set';
  const account = useOpenRouterAccount(keySet);
  if (status.isError) {
    return 'Status unavailable';
  }
  if (status.data === undefined) {
    return 'Checking…';
  }
  if (!keySet) {
    return 'Needs key';
  }
  const credits = account.data?.credits;
  return credits?.state === 'known'
    ? `Key set · ${costText(Math.round((credits.total - credits.used) * 1_000_000))} left`
    : 'Key set';
}

function appLine(status: AssistantStatus, app: 'claude-code' | 'codex'): string {
  return appText(status.apps.find((entry) => entry.app === app)?.state ?? 'not_connected');
}

function lineOf(kind: EngineKind, status: AssistantStatus, openrouter: string): string {
  const app = BACKENDS[kind].app;
  return app === null ? openrouter : appLine(status, app);
}

function Radio({ selected }: { readonly selected: boolean }): ReactNode {
  return (
    <View
      className={cn(
        'size-5 items-center justify-center rounded-full border-2',
        selected ? 'border-primary' : 'border-outline',
      )}
    >
      {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
    </View>
  );
}

function BackendRow({
  kind,
  line,
  selected,
  owner,
}: {
  readonly kind: EngineKind;
  readonly line: string;
  readonly selected: boolean;
  readonly owner: boolean;
}): ReactNode {
  const actions = useResponderActions();
  const entry = BACKENDS[kind];
  return (
    <View className="flex-row items-center pr-1">
      <Interactive
        role="radio"
        checked={selected}
        label={`${ENGINE_LABELS[kind]}, ${line}`}
        disabled={!owner}
        onPress={() => {
          if (!selected) {
            void actions.change({ default_engine: kind }, 'AI backend');
          }
        }}
        className="min-h-row-h-2 min-w-0 flex-1 flex-row items-center gap-3 px-4 py-2"
      >
        <Radio selected={selected} />
        <BrandMark brand={entry.brand} size={32} />
        <View className="min-w-0 flex-1">
          <Text variant="body">{ENGINE_LABELS[kind]}</Text>
          <Text
            variant="footnote"
            tone={line === 'Needs key' || line === 'Needs repair' ? 'critical' : 'variant'}
            numberOfLines={1}
          >
            {line}
          </Text>
        </View>
      </Interactive>
      <IconButton
        icon="chevronRight"
        label={`${ENGINE_LABELS[kind]} settings`}
        onPress={() => {
          router.push(href.settings.page(entry.page));
        }}
      />
    </View>
  );
}

export function BackendChoices(): ReactNode {
  const status = useAssistantStatus();
  const owner = useIsOwner();
  const openrouterLine = useOpenRouterLine();
  if (status === null) {
    return <Banner tone="warning" title="Can’t reach your server" />;
  }
  return (
    <View className="gap-2">
      <List inset>
        {ENGINE_KINDS.map((kind) => (
          <BackendRow
            key={kind}
            kind={kind}
            owner={owner}
            selected={status.settings.default_engine === kind}
            line={lineOf(kind, status, openrouterLine)}
          />
        ))}
      </List>
      <Text variant="footnote" tone="variant" className="px-4">
        New chats use the selected backend. Each chat can switch in its header.
      </Text>
    </View>
  );
}
