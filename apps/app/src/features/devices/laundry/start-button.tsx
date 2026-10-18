import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { clock, MINUTE_MS } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { epochMinute } from './finish';
import { Note } from './parts';
import type { DraftHandle } from './use-draft';
import type { Laundry } from './use-laundry';

function labelOf(laundry: Laundry, draft: DraftHandle, now: number): string {
  if (draft.finishAt !== null) {
    return `Schedule · finishes ${clock(draft.finishAt * MINUTE_MS)}`;
  }
  const { estimate } = draft;
  return estimate === null
    ? laundry.state.startLabel
    : `${laundry.state.startLabel} · finishes ${clock(now + estimate * MINUTE_MS)}`;
}

function Messages({
  draft,
  blocked,
}: {
  readonly draft: DraftHandle;
  readonly blocked: string | null;
}): ReactNode {
  return (
    <>
      {draft.starting ? (
        <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
          Sending to the machine…
        </Text>
      ) : null}
      {!draft.starting && blocked !== null ? <Note text={blocked} /> : null}
      {draft.failure === null ? null : <Note icon="alert" tone="critical" text={draft.failure} />}
    </>
  );
}

function StartView({
  laundry,
  draft,
  now,
}: {
  readonly laundry: Laundry;
  readonly draft: DraftHandle;
  readonly now: number;
}): ReactNode {
  const blocked = draft.reason ?? draft.problemAt(epochMinute(now));
  const disabled = blocked !== null || draft.program === undefined || !laundry.state.startable;
  return (
    <View className="gap-2">
      <Button
        label={labelOf(laundry, draft, now)}
        size="lg"
        icon={draft.finishAt === null ? 'play' : 'timer'}
        disabled={disabled}
        loading={draft.starting}
        onPress={draft.start}
      />
      <Messages draft={draft} blocked={blocked} />
    </View>
  );
}

function ClockedStart({
  laundry,
  draft,
}: {
  readonly laundry: Laundry;
  readonly draft: DraftHandle;
}): ReactNode {
  return <StartView laundry={laundry} draft={draft} now={useMinute()} />;
}

export function StartButton({
  laundry,
  draft,
}: {
  readonly laundry: Laundry;
  readonly draft: DraftHandle;
}): ReactNode {
  return draft.estimate !== null || draft.finishAt !== null ? (
    <ClockedStart laundry={laundry} draft={draft} />
  ) : (
    <StartView laundry={laundry} draft={draft} now={0} />
  );
}
