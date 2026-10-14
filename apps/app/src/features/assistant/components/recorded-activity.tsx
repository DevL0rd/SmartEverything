import { useState, type ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMotion } from '../../../design/motion';
import { useAssistantStatus } from '../data/assistant-data';
import { summaryOfSteps, type WorkStep } from '../model/work-steps';
import { WORK_COLLAPSE } from './thread-motion';
import { WorkStepList } from './work-step-list';

export function RecordedActivity({ steps }: { readonly steps: readonly WorkStep[] }): ReactNode {
  const [open, setOpen] = useState(false);
  const motion = useMotion();
  const shown = useAssistantStatus()?.settings.activity_steps !== false;
  if (!shown || steps.length === 0) return null;
  const summary = summaryOfSteps(steps, false, false);
  return (
    <Animated.View
      {...(motion.reduced ? {} : { layout: WORK_COLLAPSE })}
      className="gap-1 border-l-2 border-outline-variant pl-3"
    >
      <Interactive
        label={open ? 'Hide recorded activity' : 'Show recorded activity'}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min flex-row items-center gap-2 rounded-sm px-1"
        layerClassName="rounded-sm"
      >
        <Icon name="clock" size={16} tone="variant" />
        <Text variant="label" className="min-w-0 flex-1">
          Recorded activity
        </Text>
        <Text variant="caption" tone={summary.tone === 'failed' ? 'critical' : 'variant'}>
          {summary.note}
        </Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
      </Interactive>
      {open ? (
        <>
          <Text variant="caption" tone="variant">
            Tool positions weren’t saved in this older reply.
          </Text>
          <WorkStepList steps={steps} reasoning="" thinking={false} />
        </>
      ) : null}
    </Animated.View>
  );
}
