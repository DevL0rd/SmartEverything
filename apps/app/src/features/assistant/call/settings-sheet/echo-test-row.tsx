import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { entering, useMotion } from '../../../../design/motion';
import { clock } from '../../../../format/time';
import { useAssistantName } from '../../data/assistant-data';
import { attempt, clearEchoResult, runEchoTest } from '../call-actions';
import type { EchoTestOutcome } from '@smarteverything/domain';
import { callActive, useCall } from '../call-state';
import { callEngine } from '../engine/engine';
import {
  ECHO_OUTCOMES,
  ECHO_TEST_SECONDS,
  outcomeWords,
  type EchoOutcomeCopy,
} from '../model/listening-choices';
import { useCallAudio } from './call-audio-pref';

const STEP_MS = 1000;

function useStep(running: boolean): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const timers = Array.from({ length: ECHO_TEST_SECONDS }, (_, index) =>
      setTimeout(() => {
        setStep(index + 1);
      }, index * STEP_MS),
    );
    return (): void => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      setStep(0);
    };
  }, [running]);
  return running ? step : 0;
}

function Progress({ step }: { readonly step: number }): ReactNode {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Stay quiet for ${String(ECHO_TEST_SECONDS)} seconds. Step ${String(step)} of ${String(ECHO_TEST_SECONDS)}`}
      className="gap-2"
    >
      <View className="flex-row items-center justify-between">
        <Text variant="body-strong">{`Stay quiet for ${String(ECHO_TEST_SECONDS)} seconds…`}</Text>
        <Text
          variant="footnote"
          tone="variant"
        >{`${String(step)} of ${String(ECHO_TEST_SECONDS)}`}</Text>
      </View>
      <View className="flex-row gap-1.5">
        {Array.from({ length: ECHO_TEST_SECONDS }, (_, index) => (
          <View
            key={String(index)}
            className={cn('h-1 flex-1 rounded-full', index < step ? 'bg-primary' : 'bg-surface-3')}
          />
        ))}
      </View>
    </View>
  );
}

const TONE_ICON = {
  positive: 'circleCheck',
  warning: 'warning',
  critical: 'warning',
  info: 'info',
} as const;

function Result({
  copy,
  onUse,
  onLower,
  onClose,
  onAgain,
}: {
  readonly copy: EchoOutcomeCopy;
  readonly onUse: () => void;
  readonly onLower: (() => void) | null;
  readonly onClose: () => void;
  readonly onAgain: () => void;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View {...entering(motion, FadeIn)} className="gap-3 rounded-md bg-surface-2 p-3">
      <View className="flex-row items-start gap-3">
        <Icon name={TONE_ICON[copy.tone]} size={24} tone={copy.tone} />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">{copy.title}</Text>
          <Text variant="footnote" tone="variant">
            {copy.body}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {copy.suggestLabel === null ? (
          <Button label="Test again" variant="tonal" onPress={onAgain} />
        ) : (
          <Button label={copy.suggestLabel} variant="tonal" onPress={onUse} />
        )}
        {onLower === null ? null : (
          <Button label="Lower volume" variant="outlined" onPress={onLower} />
        )}
        <Button label="Done" variant="text" onPress={onClose} />
      </View>
    </Animated.View>
  );
}

function useBlock(): string | null {
  const call = useCall();
  const name = useAssistantName();
  const reason = callEngine.capabilities().echoTest;
  if (reason !== null) {
    return reason;
  }
  if (callActive(call) && call.phase !== 'listening') {
    return `Wait until ${name} finishes`;
  }
  return null;
}

function lastTestText(at: string | undefined, outcome: string | undefined): string {
  return at === undefined || outcome === undefined
    ? 'Never tested on this device'
    : `Last test: ${outcome} · ${clock(at)}`;
}

function useEchoRun(): () => void {
  const { change } = useCallAudio();
  return (): void => {
    attempt('The echo test did not run', async () => {
      const outcome = await runEchoTest();
      change({ last_echo_test: { outcome, at: new Date().toISOString() } }, null);
    });
  };
}

function OutcomePanel({
  outcome,
  onAgain,
}: {
  readonly outcome: EchoTestOutcome;
  readonly onAgain: () => void;
}): ReactNode {
  const { change } = useCallAudio();
  const copy = ECHO_OUTCOMES[outcome];
  return (
    <Result
      copy={copy}
      onUse={() => {
        if (copy.suggest !== null) {
          change({ echo: copy.suggest }, `Echo handling · ${copy.title}`);
        }
        clearEchoResult();
      }}
      onLower={
        outcome === 'strong'
          ? (): void => {
              change({ volume: 0.5 }, 'Assistant volume · 50%');
              clearEchoResult();
            }
          : null
      }
      onClose={clearEchoResult}
      onAgain={() => {
        clearEchoResult();
        onAgain();
      }}
    />
  );
}

export function EchoTestRow(): ReactNode {
  const { pref } = useCallAudio();
  const call = useCall();
  const block = useBlock();
  const running = call.echoTest.status === 'running';
  const step = useStep(running);
  const last = pref.last_echo_test;
  const start = useEchoRun();
  return (
    <View className="gap-3 px-4 py-3">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="body">Echo test</Text>
          <Text variant="footnote" tone="variant">
            {block ??
              lastTestText(last?.at, last === null ? undefined : outcomeWords(last.outcome))}
          </Text>
        </View>
        <Button
          label="Test echo"
          icon="play"
          variant="outlined"
          disabled={block !== null || running}
          onPress={start}
        />
      </View>
      {running ? <Progress step={step} /> : null}
      {call.echoTest.status === 'done' ? (
        <OutcomePanel outcome={call.echoTest.outcome} onAgain={start} />
      ) : null}
    </View>
  );
}
