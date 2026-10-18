import type { ReactNode } from 'react';
import { useState } from 'react';
import { Switch } from '../../../components/switch';
import { notify } from '../../../components/toast-store';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useIsOwner } from '../../../store/selectors';
import { useAdGuardTools } from '../adguard-data';
import { pausedMessage, type PauseChoice } from '../model/pause-model';
import { PauseSheet } from '../pause-sheet';
import { BlockingFace } from './blocking-faces';
import { blockingViewOf, staleCaptionOf } from './blocking-model';
import { StaleLine } from './blocking-parts';
import { Waiting } from '../../shared/service-widget-frame';
import { BlockingWidgetFrame, type BlockingReady } from './blocking-widget-frame';
import { background } from '@smarteverything/logging';

const QUICK_PAUSE: PauseChoice = { minutes: 60, chip: '1 h', spoken: '1 hour' };

function useBlockingActions(openPause: () => void): {
  readonly resume: () => Promise<unknown>;
  readonly pause: () => Promise<unknown>;
} {
  const tools = useAdGuardTools();
  return {
    resume: () => tools.run('resume_protection', {}, 'Ad blocking didn’t switch on'),
    pause: async (): Promise<unknown> => {
      const done = await tools.run(
        'pause_protection',
        { minutes: QUICK_PAUSE.minutes },
        'Ad blocking wasn’t paused',
      );
      if (done !== null) {
        notify({
          message: pausedMessage(QUICK_PAUSE),
          action: { label: 'Change', onPress: openPause },
        });
      }
      return done;
    },
  };
}

function Face({
  ready,
  owner,
  resume,
}: {
  readonly ready: BlockingReady;
  readonly owner: boolean;
  readonly resume: () => Promise<unknown>;
}): ReactNode {
  const view = blockingViewOf(ready.snapshot, ready.now);
  if (view === null) {
    const stale = staleCaptionOf(ready.snapshot.connection, ready.now);
    return stale === null ? <Waiting /> : <StaleLine caption={stale} />;
  }
  return <BlockingFace ready={ready} view={view} onResume={owner ? resume : null} />;
}

export function AdBlockingWidget(): ReactNode {
  const [pausing, setPausing] = useState(false);
  const owner = useIsOwner();
  const { cls } = useWidgetFace();
  const actions = useBlockingActions(() => {
    setPausing(true);
  });
  const action = ({ snapshot }: BlockingReady): ReactNode => {
    const { status, connection } = snapshot;
    if (!owner || cls === 's' || status === null) {
      return undefined;
    }
    const online = connection.state === 'online';
    return (
      <Switch
        label={online ? 'Ad blocking' : 'Ad blocking, unavailable: can’t reach AdGuard Home'}
        value={status.protection}
        disabled={!online}
        onChange={(enabled) => {
          background(
            enabled ? actions.resume() : actions.pause(),
            'blocking_widget.background_failed',
          );
        }}
      />
    );
  };
  return (
    <>
      <BlockingWidgetFrame title="Ad blocking" icon="shield" accent="viz-3" action={action}>
        {(ready) => <Face ready={ready} owner={owner} resume={actions.resume} />}
      </BlockingWidgetFrame>
      <PauseSheet
        open={pausing}
        onClose={() => {
          setPausing(false);
        }}
        onReopen={() => {
          setPausing(true);
        }}
      />
    </>
  );
}
