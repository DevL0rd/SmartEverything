import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { ChatTimelineTool } from '@smarteverything/domain';
import { useMotion } from '../../../design/motion';
import { Interactive } from '../../../components/interactive';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { toolActionTitle } from '../model/tool-presentation';
import { toolGroupGoal } from '../model/tool-group-goal';
import { toolOutcome, toolResultLine } from '../model/tool-outcome';
import { usePluginNames } from '../data/plugin-names';
import { WORK_COLLAPSE } from './thread-motion';
import { Spinner } from './work-step-list';
import type { InlineToolActivity } from '../model/inline-timeline';
import type { NumberedSource } from '../model/web-sources';
import { WebSources } from './web-sources';
import { ToolFileDiffs } from './tool-file-diffs';
import { ToolResultAccess } from './tool-result-access';

interface ActionStatus {
  readonly label: string;
  readonly icon: IconName;
  readonly tone: Tone;
}
const STATUS: Readonly<Record<ChatTimelineTool['state'], ActionStatus>> = {
  running: { label: 'Working', icon: 'loader', tone: 'primary' },
  done: { label: 'Succeeded', icon: 'check', tone: 'variant' },
  failed: { label: 'Failed', icon: 'alert', tone: 'critical' },
  interrupted: { label: 'Stopped', icon: 'square', tone: 'variant' },
  unknown: { label: 'Couldn’t confirm', icon: 'circle', tone: 'warning' },
};

function groupStatus(tools: readonly ChatTimelineTool[], live: boolean): ActionStatus {
  const states = tools.map((tool) => toolOutcome(tool, live));
  if (states.includes('running')) return STATUS.running;
  const failures = states.filter((state) => state === 'failed').length;
  if (failures > 0) return { ...STATUS.failed, label: `${String(failures)} failed` };
  if (states.includes('unknown')) return STATUS.unknown;
  if (states.includes('interrupted')) return STATUS.interrupted;
  return tools.some((tool) => tool.image_operation_id !== null)
    ? { ...STATUS.done, label: 'Started' }
    : STATUS.done;
}

function StatusIcon({ status }: { readonly status: ActionStatus }): ReactNode {
  return status.icon === 'loader' ? (
    <Spinner />
  ) : (
    <Icon name={status.icon} size={16} tone={status.tone} />
  );
}

function ToolAction({
  tool,
  title,
  live,
}: {
  readonly tool: ChatTimelineTool;
  readonly title: string;
  readonly live: boolean;
}): ReactNode {
  const outcome = toolOutcome(tool, live);
  const status =
    outcome === 'done' && tool.image_operation_id !== null
      ? { ...STATUS.done, label: 'Started' }
      : STATUS[outcome];
  const result = toolResultLine(tool, live);
  return (
    <View className="gap-1 py-1.5" accessibilityLabel={`${title}. ${status.label}`}>
      <View className="flex-row items-start gap-2">
        <StatusIcon status={status} />
        <Text variant="footnote" className="min-w-0 flex-1" selectable>
          {title}
        </Text>
        <Text variant="caption" tone={status.tone}>
          {status.label}
        </Text>
      </View>
      {result === null || result === title ? null : (
        <Text variant="caption" tone="variant" className="pl-6" selectable>
          {result}
        </Text>
      )}
      <ToolFileDiffs tool={{ ...tool, state: outcome }} />
      <ToolResultAccess output={tool.output} title={title} />
    </View>
  );
}

function GroupBody({
  activities,
  live,
  pluginName,
}: {
  readonly activities: readonly InlineToolActivity[];
  readonly live: boolean;
  readonly pluginName: (id: string) => string | null;
}): ReactNode {
  return (
    <View className="gap-1 pl-4">
      {activities.map((activity) =>
        activity.kind === 'tool' ? (
          <ToolAction
            key={activity.key}
            tool={activity.tool}
            title={toolActionTitle(activity.tool, pluginName)}
            live={live}
          />
        ) : (
          <View key={activity.key} className="gap-1 py-1.5">
            <Text variant="caption" tone="variant">
              Thinking
            </Text>
            <Text variant="footnote" tone="variant" selectable>
              {activity.text}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

function ToolSummary({
  title,
  count,
  status,
  thinking,
  open,
  toggle,
}: {
  readonly title: string;
  readonly count: number;
  readonly status: ActionStatus;
  readonly thinking: boolean;
  readonly open: boolean;
  readonly toggle: () => void;
}): ReactNode {
  return (
    <View className="min-h-touch-min max-w-full justify-center self-start">
      <Interactive
        label={`${title}, ${String(count)} ${count === 1 ? 'action' : 'actions'}, ${status.label}${thinking ? ', thinking available' : ''}`}
        checked={open}
        hitSlop={10}
        hint={open ? 'Hide actions' : 'Show actions and results'}
        onPress={toggle}
        className="min-h-6 flex-row items-center gap-1.5 self-start rounded-sm px-1"
        layerClassName="rounded-sm"
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} tone="variant" />
        <Text variant="caption" numberOfLines={2} className="min-w-0 shrink" tone="variant">
          {title}
        </Text>
        {count > 1 ? (
          <Text variant="caption" tone="variant">
            · {String(count)}
          </Text>
        ) : null}
        <Text variant="caption" tone={status.tone}>
          {status.label}
        </Text>
        {thinking ? (
          <Text variant="caption" tone="variant">
            · Thinking
          </Text>
        ) : null}
      </Interactive>
    </View>
  );
}

export function InlineTool({
  tools,
  live,
  activities,
  sources,
}: {
  readonly activities: readonly InlineToolActivity[];
  readonly sources: readonly NumberedSource[];
  readonly tools: readonly ChatTimelineTool[];
  readonly live: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const plugins = usePluginNames();
  const motion = useMotion();
  const status = groupStatus(tools, live);
  const title = toolGroupGoal(tools, (id) => plugins.get(id) ?? null);
  const thinking = activities.some((activity) => activity.kind === 'reasoning');
  return (
    <Animated.View {...(motion.reduced ? {} : { layout: WORK_COLLAPSE })} className="min-w-0 gap-1">
      {tools.length > 1 ? (
        <ToolSummary
          title={title}
          count={tools.length}
          status={status}
          thinking={thinking}
          open={open}
          toggle={() => {
            setOpen(!open);
          }}
        />
      ) : null}
      {tools.length === 1 || open ? (
        <GroupBody
          activities={activities}
          live={live}
          pluginName={(id) => plugins.get(id) ?? null}
        />
      ) : null}
      <WebSources sources={sources} />
    </Animated.View>
  );
}
