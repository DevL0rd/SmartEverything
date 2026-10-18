import type { AdGuardSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { Switch } from '../../../components/switch';
import { StreamProblem } from '../../shared/plugin-notice';
import { PluginButton } from '../../shared/plugin-action';
import { ServiceHero, ServiceHeroSkeleton } from '../../shared/service-hero';
import { ServiceMedallion } from '../../shared/service-medallion';
import { useSectionParam } from '../../../components/use-section-param';
import { useAdGuardSnapshot, useAdGuardTools } from '../adguard-data';
import { PauseSheet } from '../pause-sheet';
import { heroOf, type HeroModel } from './hero-model';
import { background } from '@smarteverything/logging';

const OPEN = 'open';

function Actions({
  hero,
  pause,
  resume,
}: {
  readonly hero: HeroModel;
  readonly pause: () => void;
  readonly resume: () => Promise<unknown>;
}): ReactNode {
  if (hero.protection === 'paused' || hero.protection === 'off') {
    return (
      <PluginButton
        label={hero.protection === 'paused' ? 'Resume' : 'Turn on'}
        icon="play"
        variant="tonal"
        onPress={resume}
      />
    );
  }
  return (
    <Button
      label="Pause…"
      icon="pause"
      variant="tonal"
      disabled={hero.locked !== null}
      {...(hero.locked === null ? {} : { hint: hero.locked })}
      onPress={pause}
    />
  );
}

function hasActions(hero: HeroModel, wasOn: boolean): boolean {
  return hero.protection !== null || wasOn;
}

function HeroSwitch({
  on,
  locked,
  pause,
  resume,
}: {
  readonly on: boolean;
  readonly locked: boolean;
  readonly pause: () => void;
  readonly resume: () => Promise<unknown>;
}): ReactNode {
  return (
    <Switch
      label="Ad blocking"
      value={on}
      disabled={locked}
      onChange={(enabled) => {
        if (enabled) {
          background(resume(), 'adguard_hero.resume_failed');
        } else {
          pause();
        }
      }}
    />
  );
}

function Ready({ snapshot }: { readonly snapshot: AdGuardSnapshot }): ReactNode {
  const tools = useAdGuardTools();
  const [pausing, openPause, closePause] = useSectionParam('pause');
  const hero = heroOf(snapshot);
  const wasOn = snapshot.status?.protection === true;
  const pause = (): void => {
    openPause(OPEN);
  };
  const resume = (): Promise<unknown> =>
    tools.run('resume_protection', {}, 'Ad blocking didn’t switch on');
  return (
    <>
      <ServiceHero
        medallion={
          <ServiceMedallion
            glyph="shield"
            tone={hero.tone}
            ratio={hero.ratio}
            live={false}
            size="hero"
            label={hero.spoken}
            offline={hero.stale}
          />
        }
        state={{ title: hero.title, tone: hero.tone }}
        facts={hero.facts}
        stale={hero.stale}
        {...(snapshot.status === null
          ? {}
          : {
              trailing: (
                <HeroSwitch
                  on={wasOn}
                  locked={hero.locked !== null}
                  pause={pause}
                  resume={resume}
                />
              ),
            })}
        {...(hasActions(hero, wasOn)
          ? { actions: <Actions hero={hero} pause={pause} resume={resume} /> }
          : {})}
        {...(hero.figures === undefined ? {} : { figures: hero.figures })}
      />
      <PauseSheet open={pausing === OPEN} onClose={closePause} onReopen={pause} />
    </>
  );
}

export function AdGuardHero(): ReactNode {
  const stream = useAdGuardSnapshot();
  if (stream.state === 'waiting') {
    return <ServiceHeroSkeleton />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  return stream.value.connection.state === 'not_set_up' ? null : <Ready snapshot={stream.value} />;
}
