import type { ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Grid } from '../../../components/grid';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { StatTile } from '../../../components/stat-tile';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { FirstRun } from '../components/ideas';
import { IdeaRows } from '../components/new-automation';
import { NextUp } from '../components/next-up';
import { PlaceBanner } from '../components/place-banner';
import { RecentRuns } from '../components/recent-runs';
import { useZone } from '../components/owned-runs';
import { countLine, useAutomationsPage, type AutomationsPage } from '../data/use-automations';
import { useRows } from '../../../store/selectors';
import { countRunsOnDay } from '../model/run-history';
import { subtitleProp } from './shared';

const RECENT = 5;
const IDEAS = 3;

function Glance({
  page,
  ranToday,
}: {
  readonly page: AutomationsPage;
  readonly ranToday: number;
}): ReactNode {
  const on = page.rules.filter((rule) => rule.row.enabled).length;
  return (
    <Grid minItemWidth={160}>
      <StatTile label="On" value={String(on)} />
      <StatTile label="Paused" value={String(page.rules.length - on)} />
      <StatTile label="Runs today" value={String(ranToday)} />
    </Grid>
  );
}

function Overview({ page }: { readonly page: AutomationsPage }): ReactNode {
  const router = useRouter();
  const runs = useRows('automation_runs');
  const now = useMinute();
  const zone = useZone();
  const today = localDayKey(new Date(now), zone);
  return (
    <>
      <Glance page={page} ranToday={countRunsOnDay(runs, today, zone)} />
      {page.reading.usable ? <NextUp rules={page.rules} place={page.reading.place} /> : null}
      <RecentRuns count={RECENT} />
      {page.ideas.length === 0 ? null : (
        <IdeaRows
          ideas={page.ideas.slice(0, IDEAS)}
          onPick={(idea) => {
            router.push(href.automation('new', idea.id));
          }}
        />
      )}
    </>
  );
}

export function AutomationsOverview(): ReactNode {
  const page = useAutomationsPage();
  return (
    <Screen
      maxWidth="reading"
      header={
        <PageHeader
          title="Automations"
          settings={mainPageSettings('automations')}
          {...subtitleProp(countLine(page.rules))}
        />
      }
      {...(page.status.kind === 'ok' ? {} : { banner: <PlaceBanner status={page.status} /> })}
    >
      {page.rules.length === 0 ? <FirstRun ideas={page.ideas} /> : <Overview page={page} />}
    </Screen>
  );
}
