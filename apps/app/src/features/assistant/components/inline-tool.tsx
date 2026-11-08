import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ChatTimelineTool } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { CollapseBody, CollapseRoot } from '../../../components/disclosure';
import { SHOWN_AT_ONCE, useProgressiveCount } from '../../../design/progressive-count';
import { useSecondOf } from '../../../store/clock';
import { usePluginNames } from '../data/plugin-names';
import { toolActionTitle } from '../model/tool-presentation';
import {
  activitySummary,
  activitySummaryLine,
  type ActivitySummary,
} from '../model/tool-group-goal';
import { toolOutcome, toolResultLine } from '../model/tool-outcome';
import { cachedToolFileDiffs } from '../model/tool-file-diffs';
import type { InlineToolActivity } from '../model/inline-timeline';
import type { NumberedSource } from '../model/web-sources';
import { WebSources } from './web-sources';
import { FileDiffList } from './tool-file-diffs';
import { ActivityAnnouncement } from './activity-announcement';
import {
  ActivityLine,
  ActivityRow,
  ActivityRows,
  elapsedLabel,
  useActivityOpen,
  WaitingLine,
  type ActivityGlyph,
  type ActivityLineText,
} from './work-step-list';

type PluginName = (id: string) => string | null;

const NO_TOOLS: readonly ChatTimelineTool[] = [];

function noPlugin(): null {
  return null;
}

const OUTCOME_GLYPH: Readonly<Record<ChatTimelineTool['state'], ActivityGlyph>> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
  interrupted: 'stopped',
  unknown: 'unknown',
};

const SUMMARY_GLYPH: Readonly<Record<ActivitySummary['tone'], ActivityGlyph>> = {
  live: 'running',
  done: 'done',
  failed: 'partial',
  stopped: 'stopped',
};

export function activityLineOf(
  summary: ActivitySummary,
  tools: readonly ChatTimelineTool[],
  pluginName: PluginName,
): ActivityLineText {
  const only = tools.length === 1 ? tools[0] : undefined;
  if (summary.tone === 'done' && only !== undefined) {
    const title = toolActionTitle(only, pluginName);
    return { glyph: 'done', lead: title, notes: [], verbs: [], label: title };
  }
  return {
    glyph: tools.length === 0 && summary.tone !== 'live' ? 'thought' : SUMMARY_GLYPH[summary.tone],
    lead: summary.lead,
    notes: summary.failedNote === null ? [] : [summary.failedNote],
    verbs: summary.verbs,
    label: activitySummaryLine(summary, summary.verbs.length),
  };
}

export function useLiveSeconds(startedAt: string, running: boolean): string | null {
  const started = Date.parse(startedAt);
  return useSecondOf((now) => (running ? elapsedLabel((now - started) / 1000) : null), running);
}

function ToolRow({
  tool,
  live,
  pluginName,
}: {
  readonly tool: ChatTimelineTool;
  readonly live: boolean;
  readonly pluginName: PluginName;
}): ReactNode {
  const outcome = toolOutcome(tool, live);
  const title = toolActionTitle(tool, pluginName);
  const result = toolResultLine(tool, live);
  const failed = outcome === 'failed';
  const diffs = cachedToolFileDiffs(tool, outcome);
  return (
    <ActivityRow
      glyph={OUTCOME_GLYPH[outcome]}
      title={title}
      hint={failed ? null : result}
      reason={failed ? result : null}
      rise={live}
    >
      {diffs.length === 0 ? undefined : <FileDiffList diffs={diffs} />}
    </ActivityRow>
  );
}

function ThinkingRow({ text, live }: { readonly text: string; readonly live: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <ActivityRow
      glyph="thought"
      title="Thinking"
      hint={null}
      reason={null}
      rise={live}
      toggle={{
        open,
        hint: open ? 'Hide thinking' : 'Show thinking',
        onPress: () => {
          setOpen(!open);
        },
      }}
    >
      {open ? (
        <Text variant="footnote" tone="variant" selectable>
          {text}
        </Text>
      ) : undefined}
    </ActivityRow>
  );
}

const ToolRows = memo(function ToolRows({
  activities,
  live,
  pluginName,
}: {
  readonly activities: readonly InlineToolActivity[];
  readonly live: boolean;
  readonly pluginName: PluginName;
}): ReactNode {
  const mounted = useProgressiveCount(activities.length, !live, SHOWN_AT_ONCE);
  return (
    <ActivityRows>
      {activities
        .slice(0, mounted)
        .map((activity) =>
          activity.kind === 'tool' ? (
            <ToolRow key={activity.key} tool={activity.tool} live={live} pluginName={pluginName} />
          ) : (
            <ThinkingRow key={activity.key} text={activity.text} live={live} />
          ),
        )}
    </ActivityRows>
  );
});

export interface InlineToolProps {
  readonly activities: readonly InlineToolActivity[];
  readonly sources: readonly NumberedSource[];
  readonly tools: readonly ChatTimelineTool[];
  readonly live: boolean;
  readonly active: boolean;
  readonly stopped: boolean;
  readonly openKey: string;
  readonly startedAt: string;
}

export function InlineTool({
  activities,
  sources,
  tools,
  live,
  active,
  stopped,
  openKey,
  startedAt,
}: InlineToolProps): ReactNode {
  const plugins = usePluginNames();
  const pluginName = useCallback((id: string) => plugins.get(id) ?? null, [plugins]);
  const running = live && (active || tools.some((tool) => tool.state === 'running'));
  const text = useMemo(() => {
    const thinking = activities.some((activity) => activity.kind === 'reasoning');
    const input = { tools, live: running, stopped, thinking, thoughtSeconds: null, pluginName };
    return activityLineOf(activitySummary(input), tools, pluginName);
  }, [activities, tools, running, stopped, pluginName]);
  const [open, toggle] = useActivityOpen(openKey, live);
  const duration = useLiveSeconds(startedAt, running);
  return (
    <View className="min-w-0 gap-1">
      <ActivityAnnouncement status={text.label} text={text.label} announceOnMount={running} />
      <CollapseRoot className="min-w-0">
        <ActivityLine
          text={text}
          duration={duration}
          live={running}
          open={open}
          onToggle={toggle}
        />
        {open ? (
          <CollapseBody>
            <ToolRows activities={activities} live={running} pluginName={pluginName} />
          </CollapseBody>
        ) : null}
      </CollapseRoot>
      <WebSources sources={sources} />
    </View>
  );
}

export function ThinkingActivity({
  text,
  live,
  openKey,
  startedAt,
}: {
  readonly text: string;
  readonly live: boolean;
  readonly openKey: string;
  readonly startedAt: string;
}): ReactNode {
  const [open, toggle] = useActivityOpen(openKey, live);
  const duration = useLiveSeconds(startedAt, live);
  const summary = activitySummary({
    tools: NO_TOOLS,
    live,
    stopped: false,
    thinking: true,
    thoughtSeconds: null,
    pluginName: noPlugin,
  });
  const line: ActivityLineText = {
    ...activityLineOf(summary, NO_TOOLS, noPlugin),
    glyph: 'thought',
  };
  return (
    <CollapseRoot className="min-w-0">
      <ActivityLine text={line} duration={duration} live={live} open={open} onToggle={toggle} />
      {open ? (
        <CollapseBody className="pl-6 pt-0.5">
          <Text variant="footnote" tone="variant" selectable>
            {text}
          </Text>
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}

export function ThinkingWait({ startedAt }: { readonly startedAt: string }): ReactNode {
  const duration = useLiveSeconds(startedAt, true);
  const summary = activitySummary({
    tools: NO_TOOLS,
    live: true,
    stopped: false,
    thinking: true,
    thoughtSeconds: null,
    pluginName: noPlugin,
  });
  return <WaitingLine text={activityLineOf(summary, NO_TOOLS, noPlugin)} duration={duration} />;
}
