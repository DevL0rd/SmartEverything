import type { ReactNode } from 'react';
import { StreamProblem } from '../../shared/plugin-notice';
import { PluginButton } from '../../shared/plugin-action';
import { ServiceHero, ServiceHeroSkeleton } from '../../shared/service-hero';
import { ServiceMedallion } from '../../shared/service-medallion';
import { useSyncthingSnapshot } from '../syncthing-data';
import { heroOf } from './hero-model';
import { useSyncActions } from './sync-actions';

function HeroActions({ paused }: { readonly paused: boolean }): ReactNode {
  const actions = useSyncActions();
  return (
    <>
      <PluginButton
        label={paused ? 'Resume all' : 'Pause all'}
        icon={paused ? 'play' : 'pause'}
        variant="tonal"
        onPress={() => actions.pause({ kind: 'all' }, !paused, null)}
      />
      <PluginButton
        label="Rescan all"
        icon="refresh"
        variant="tonal"
        onPress={() => actions.rescan(null)}
      />
    </>
  );
}

export function SyncHeroCard(): ReactNode {
  const stream = useSyncthingSnapshot();
  if (stream.state === 'waiting') {
    return <ServiceHeroSkeleton />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const snapshot = stream.value;
  if (snapshot.connection.state === 'not_set_up') {
    return null;
  }
  const hero = heroOf(snapshot);
  return (
    <ServiceHero
      medallion={
        <ServiceMedallion
          glyph="folderSync"
          tone={hero.tone}
          ratio={hero.ratio}
          live={hero.live}
          size="hero"
          label={hero.spoken}
          offline={hero.stale}
        />
      }
      state={{ title: hero.title, tone: hero.tone }}
      facts={hero.facts}
      stale={hero.stale}
      {...(hero.figures === undefined ? {} : { figures: hero.figures })}
      {...(hero.ringNote === undefined ? {} : { ringNote: hero.ringNote })}
      {...(hero.canAct
        ? { actions: <HeroActions paused={snapshot.summary.state === 'paused'} /> }
        : {})}
    />
  );
}
