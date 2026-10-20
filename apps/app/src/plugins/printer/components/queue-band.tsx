import type { PrinterActionName, PrinterJob, PrinterQueue } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import type { PrinterLive } from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import type { PrinterActor } from '../data/use-printer-view';
import { countLabel } from '../model/format';
import { JobCard, type JobHandlers } from './job-card';
import { WaitingList } from './waiting-list';

export interface QueueBandProps {
  readonly device: Device;
  readonly live: PrinterLive;
  readonly queue: PrinterQueue;
  readonly actor: PrinterActor;
  readonly mayCancel: boolean;
  readonly actions: readonly PrinterActionName[];
}

function Last({ queue }: { readonly queue: PrinterQueue }): ReactNode {
  const { last } = queue;
  return last === null ? null : (
    <Text variant="caption" tone="variant">
      Last job: {last.name ?? 'Document'}, {countLabel(last.pages ?? 0, 'page')} ({last.state})
    </Text>
  );
}

function Idle({ band }: { readonly band: QueueBandProps }): ReactNode {
  const { queue, actions, actor, device, live } = band;
  const test = actions.includes('test_page');
  return (
    <View className="gap-2">
      <EmptyState
        compact
        icon="printer"
        title="Nothing printing"
        body={
          test ? 'Check the colours and the paper path with a test page.' : 'The queue is empty.'
        }
        {...(test
          ? {
              action: (
                <Button
                  label="Print a test page"
                  icon="fileText"
                  variant="tonal"
                  disabled={!live.online}
                  onPress={() => {
                    actor.fire(
                      { action: 'test_page', printer: device.external_id },
                      'Could not print the test page',
                    );
                  }}
                />
              ),
            }
          : {})}
      />
      <Last queue={queue} />
    </View>
  );
}

function QueueControl({ band }: { readonly band: QueueBandProps }): ReactNode {
  const { live, actions, actor, device } = band;
  const paused = live.queue === 'paused';
  const action = paused ? 'resume' : 'pause';
  if (!actions.includes(action)) return null;
  return (
    <View className="flex-row items-center gap-3 border-t border-outline-variant pt-3">
      <Text variant="caption" tone="variant" className="min-w-0 flex-1">
        {paused ? 'The queue is paused. New jobs wait.' : 'Jobs print in the order they arrive.'}
      </Text>
      <Button
        label={paused ? 'Resume printing' : 'Pause the queue'}
        icon={paused ? 'play' : 'pause'}
        variant="tonal"
        disabled={!live.online}
        onPress={() => {
          actor.fire(
            { action, printer: device.external_id },
            paused ? 'Could not resume the queue' : 'Could not pause the queue',
          );
        }}
      />
    </View>
  );
}

function handlersOf(job: PrinterJob, band: QueueBandProps): JobHandlers {
  const { device, live, actor, mayCancel } = band;
  const printer = device.external_id;
  const allowed = mayCancel || job.mine;
  const send = (action: 'cancel' | 'hold' | 'release', failure: string): (() => void) | null =>
    allowed
      ? (): void => {
          actor.fire({ action, printer, job: job.key }, failure);
        }
      : null;
  const holds = live.details.features.hold;
  return {
    onCancel: send('cancel', 'Could not cancel the job'),
    onHold: holds ? send('hold', 'Could not hold the job') : null,
    onRelease: holds ? send('release', 'Could not release the job') : null,
  };
}

function OthersLine({
  band,
  total,
}: {
  readonly band: QueueBandProps;
  readonly total: number;
}): ReactNode {
  const { others } = band.queue;
  if (others === 0) return null;
  return (
    <Text variant="caption" tone="variant">
      {others === total
        ? `${others === 1 ? 'This job is' : 'These jobs are'} from other people`
        : `${countLabel(others, 'job')} of ${String(total)} from other people`}
    </Text>
  );
}

export function QueueBand(props: QueueBandProps): ReactNode {
  const { queue } = props;
  const { active } = queue;
  const jobs = [...(active === null ? [] : [active]), ...queue.waiting];
  return (
    <Card title="Queue" icon="fileText">
      {jobs.length === 0 ? (
        <View className="gap-3">
          <Idle band={props} />
          <QueueControl band={props} />
        </View>
      ) : (
        <View className="gap-3">
          {active === null ? null : (
            <JobCard
              job={active}
              stopped={props.live.state === 'stopped'}
              ppm={props.live.details.ppm}
              {...handlersOf(active, props)}
            />
          )}
          <WaitingList
            entries={queue.waiting.map((job) => ({ job, handlers: handlersOf(job, props) }))}
          />
          <OthersLine band={props} total={jobs.length} />
          <QueueControl band={props} />
        </View>
      )}
    </Card>
  );
}
