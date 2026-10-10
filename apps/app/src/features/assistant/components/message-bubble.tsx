import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useContextMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { entering, useMotion } from '../../../design/motion';
import { Attachments } from './attachments';
import { CallBubble } from './call-bubble';
import { WorkSummary, stepsOf } from './work-summary';
import { CompactionDivider } from './compaction-divider';
import { ToolsNotice, toolsChangeOf } from './tools-notice';
import { isCompaction } from '../data/compaction';
import { Markdown } from './markdown/markdown';
import { MessageActionBar, useMessageActions } from './message-actions';
import { useWorkingRenderer } from './streaming-context';
import { MessageWidgets } from '../widgets/message-widgets';

const OPENED_AT = Date.now();

export interface BubbleProps {
  readonly row: AssistantMessageRow;
}

function SystemLine({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  return (
    <View className="flex-row items-center gap-2 self-center rounded-full bg-surface-2 px-3 py-1.5">
      <Icon name="sparkles" size={16} tone="primary" />
      <Text variant="caption" tone="variant">
        {row.text}
      </Text>
    </View>
  );
}

function Content({ row }: BubbleProps): ReactNode {
  const working = useWorkingRenderer();
  if (working !== null && row.role === 'responder' && row.state === 'working') {
    return (
      <View className="w-full gap-2">
        {working(row)}
        <MessageWidgets row={row} />
      </View>
    );
  }
  const mine = row.role === 'person';
  return (
    <View
      className={
        mine ? 'max-w-full gap-2 self-end rounded-xl bg-surface-3 px-4 py-2.5' : 'w-full gap-2'
      }
    >
      {mine || row.steps.length === 0 ? null : (
        <WorkSummary steps={stepsOf(row.steps, false)} live={false} />
      )}
      {row.attachments.length === 0 ? null : <Attachments attachments={row.attachments} />}
      {row.text === '' ? null : <Markdown text={row.text} />}
      {mine ? null : <MessageWidgets row={row} />}
    </View>
  );
}

function Message({ row }: BubbleProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [hovered, setHovered] = useState(false);
  const actions = useMessageActions(row);
  const menu = useContextMenu(actions.items, 'Message');
  const mine = row.role === 'person';
  return (
    <View
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      className={mine ? 'relative items-end pl-12 medium:pl-24' : 'relative items-start'}
    >
      <Interactive
        role="none"
        label={mine ? 'Your message' : 'Reply'}
        onLongPress={pointer ? undefined : menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        className={mine ? 'max-w-full items-end' : 'w-full'}
      >
        <Content row={row} />
      </Interactive>
      <MessageActionBar
        actions={actions}
        pointer={pointer}
        visible={hovered}
        align={mine ? 'end' : 'start'}
      />
      {menu.host}
      {actions.host}
    </View>
  );
}

function Row({ row }: BubbleProps): ReactNode {
  if (row.kind === 'call') {
    return <CallBubble row={row} />;
  }
  if (isCompaction(row)) {
    return <CompactionDivider row={row} />;
  }
  const tools = toolsChangeOf(row);
  if (tools !== null) {
    return <ToolsNotice change={tools} />;
  }
  return row.role === 'system' ? <SystemLine row={row} /> : <Message row={row} />;
}

export function MessageBubble({ row }: BubbleProps): ReactNode {
  const motion = useMotion();
  const fresh = Date.parse(row.created_at) > OPENED_AT;
  return (
    <Animated.View {...(fresh ? entering(motion, FadeIn.duration(180)) : {})}>
      <Row row={row} />
    </Animated.View>
  );
}
