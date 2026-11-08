import type { ReactNode } from 'react';
import { useState } from 'react';
import { Switch } from '../../../components/switch';
import { notify } from '../../../components/toast-store';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useIsOwner } from '../../../store/selectors';
import { useAdGuardTools } from '../adguard-data';
import { pauseInput, pausedMessage, RESUME_INPUT, type PauseChoice } from '../model/pause-model';
import { PauseSheet } from '../pause-sheet';
import { BlockingFace } from './blocking-faces';
import { blockingViewOf, staleCaptionOf } from './blocking-model';
import { Resume, StaleLine } from './blocking-parts';
import { Waiting, type ServiceLayout } from '../../shared/service-widget-frame';
import { BlockingWidgetFrame, type BlockingReady } from './blocking-widget-frame';
import { background } from '@smarteverything/logging';

const QUICK_PAUSE: PauseChoice = { minutes: 60, chip: '1 h', spoken: '1 hour' };

interface BlockingActions {
  readonly resume: () => Promise<unknown>;
  readonly pause: () => Promise<unknown>;
}

function useBlockingActions(openPause: () => void): BlockingActions {
  const tools = useAdGuardTools();
  return {
    resume: () => tools.run('set_protection', RESUME_INPUT, 'Ad blocking didn’t switch on'),
    pause: async (): Promise<unknown> => {
      const done = await tools.run(
        'set_protection',
        pauseInput(QUICK_PAUSE),
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
  layout,
}: {
  readonly ready: BlockingReady;
  readonly layout: ServiceLayout;
}): ReactNode {
  const view = blockingViewOf(ready.snapshot, ready.now);
  if (view === null) {
    const stale = staleCaptionOf(ready.snapshot.connection, ready.now);
    return stale === null ? <Waiting /> : <StaleLine caption={stale} />;
  }
  return <BlockingFace ready={ready} layout={layout} view={view} />;
}

function Band({
  ready,
  protection,
  actions,
}: {
  readonly ready: BlockingReady;
  readonly protection: boolean;
  readonly actions: BlockingActions;
}): ReactNode {
  const online = ready.snapshot.connection.state === 'online';
  const view = blockingViewOf(ready.snapshot, ready.now);
  const stopped = view !== null && view.stale === null && view.protection !== 'on';
  return (
    <>
      {stopped ? <Resume onResume={actions.resume} /> : null}
      <Switch
        label={online ? 'Ad blocking' : 'Ad blocking, unavailable: can’t reach AdGuard Home'}
        value={protection}
        disabled={!online}
        onChange={(enabled) => {
          background(
            enabled ? actions.resume() : actions.pause(),
            'blocking_widget.background_failed',
          );
        }}
      />
    </>
  );
}

export function AdBlockingWidget(): ReactNode {
  const [pausing, setPausing] = useState(false);
  const owner = useIsOwner();
  const { cls } = useWidgetFace();
  const actions = useBlockingActions(() => {
    setPausing(true);
  });
  const band = (ready: BlockingReady): ReactNode => {
    const { status } = ready.snapshot;
    return !owner || cls === 's' || status === null ? undefined : (
      <Band ready={ready} protection={status.protection} actions={actions} />
    );
  };
  return (
    <>
      <BlockingWidgetFrame title="Ad blocking" icon="shield" accent="viz-3" actions={band}>
        {(ready, layout) => <Face ready={ready} layout={layout} />}
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
