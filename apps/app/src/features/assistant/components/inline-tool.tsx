import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ChatTimelineTool } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { toolActionTitle } from '../model/tool-presentation';
import { toolGroupGoal } from '../model/tool-group-goal';
import { toolOutcome, toolResultLine } from '../model/tool-outcome';
import { usePluginNames } from '../data/plugin-names';
import { Disclosure } from '../../../components/disclosure';
import { Spinner } from './work-step-list';
import type { InlineToolActivity } from '../model/inline-timeline';
import type { NumberedSource } from '../model/web-sources';
import { WebSources } from './web-sources';
import { ToolFileDiffs } from './tool-file-diffs';
import { useProgressiveCount } from '../../../design/progressive-count';

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

const STARTED: ActionStatus = { ...STATUS.done, label: 'Started' };

function groupStatus(tools: readonly ChatTimelineTool[], live: boolean): ActionStatus {
  const states = tools.map((tool) => toolOutcome(tool, live));
  if (states.includes('running')) return STATUS.running;
  const failures = states.filter((state) => state === 'failed').length;
  if (failures > 0) return { ...STATUS.failed, label: `${String(failures)} failed` };
  if (states.includes('unknown')) return STATUS.unknown;
  if (states.includes('interrupted')) return STATUS.interrupted;
  return tools.some((tool) => tool.image_operation_id !== null) ? STARTED : STATUS.done;
}

const StatusIcon = memo(function StatusIcon({
  icon,
  tone,
}: {
  readonly icon: IconName;
  readonly tone: Tone;
}): ReactNode {
  return icon === 'loader' ? <Spinner /> : <Icon name={icon} size={16} tone={tone} />;
});

const ToolAction = memo(function ToolAction({
  tool,
  title,
  live,
}: {
  readonly tool: ChatTimelineTool;
  readonly title: string;
  readonly live: boolean;
}): ReactNode {
  const outcome = toolOutcome(tool, live);
  const status = outcome === 'done' && tool.image_operation_id !== null ? STARTED : STATUS[outcome];
  const result = outcome === 'done' ? null : toolResultLine(tool, live);
  return (
    <View className="gap-1 py-1.5" accessibilityLabel={`${title}. ${status.label}`}>
      <View className="flex-row items-start gap-2">
        <StatusIcon icon={status.icon} tone={status.tone} />
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
      <ToolFileDiffs tool={tool} state={outcome} />
    </View>
  );
});

const GroupBody = memo(function GroupBody({
  activities,
  live,
  pluginName,
}: {
  readonly activities: readonly InlineToolActivity[];
  readonly live: boolean;
  readonly pluginName: (id: string) => string | null;
}): ReactNode {
  const mounted = useProgressiveCount(activities.length, !live);
  return (
    <View className="gap-1 pl-4">
      {activities.slice(0, mounted).map((activity) =>
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
});

function groupLabel(title: string, count: number, status: ActionStatus, thinking: boolean): string {
  const actions = `${String(count)} actions`;
  return `${title}, ${actions}, ${status.label}${thinking ? ', thinking available' : ''}`;
}

function ThinkingMark(): ReactNode {
  return (
    <Text variant="caption" tone="variant">
      · Thinking
    </Text>
  );
}

interface GroupProps {
  readonly activities: readonly InlineToolActivity[];
  readonly tools: readonly ChatTimelineTool[];
  readonly live: boolean;
  readonly active: boolean;
  readonly pluginName: (id: string) => string | null;
}

const GroupDisclosure = memo(function GroupDisclosure({
  tools,
  live,
  active,
  activities,
  pluginName,
}: GroupProps): ReactNode {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const body = <GroupBody activities={activities} live={live} pluginName={pluginName} />;
  const open = chosen ?? active;
  const thinking = useMemo(
    () => activities.some((activity) => activity.kind === 'reasoning'),
    [activities],
  );
  const status = useMemo(() => groupStatus(tools, live), [tools, live]);
  const title = useMemo(() => toolGroupGoal(tools, pluginName), [tools, pluginName]);
  return (
    <Disclosure
      label={title}
      accessibleLabel={groupLabel(title, tools.length, status, thinking)}
      count={tools.length}
      status={status}
      trailing={thinking ? <ThinkingMark /> : undefined}
      open={open}
      onToggle={() => {
        setChosen(!open);
      }}
      hint={open ? 'Hide actions' : 'Show actions and results'}
    >
      {body}
    </Disclosure>
  );
});

const ToolGroup = memo(function ToolGroup(props: GroupProps): ReactNode {
  return props.tools.length === 1 ? (
    <GroupBody
      activities={props.activities}
      live={props.live}
      pluginName={props.pluginName}
    />
  ) : (
    <GroupDisclosure {...props} />
  );
});

export function InlineTool({
  sources,
  ...group
}: {
  readonly activities: readonly InlineToolActivity[];
  readonly sources: readonly NumberedSource[];
  readonly tools: readonly ChatTimelineTool[];
  readonly live: boolean;
  readonly active: boolean;
}): ReactNode {
  const plugins = usePluginNames();
  const pluginName = useCallback((id: string) => plugins.get(id) ?? null, [plugins]);
  return (
    <View className="min-w-0 gap-1">
      <ToolGroup {...group} pluginName={pluginName} />
      <WebSources sources={sources} />
    </View>
  );
}
