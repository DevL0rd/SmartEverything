import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Grid } from '../../../components/grid';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { StatTile } from '../../../components/stat-tile';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRunEvents } from '../data/use-run-events';
import { FirstRun } from '../components/ideas';
import { IdeaRows } from '../components/new-automation';
import { NextUp } from '../components/next-up';
import { PlaceBanner } from '../components/place-banner';
import { RunRow, useRunSheet } from '../components/runs';
import { countLine, useAutomationsPage, type AutomationsPage } from '../data/use-automations';
import { runsOf } from '../model/history';
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
  const events = useRunEvents().events;
  const now = useMinute();
  const zone = page.reading.usable ? page.reading.place.timeZone : null;
  const runs = runsOf(events, null);
  const today = localDayKey(new Date(now), zone);
  const sheet = useRunSheet(events, zone);
  return (
    <>
      <Glance
        page={page}
        ranToday={runs.filter((run) => localDayKey(run.at, zone) === today).length}
      />
      {page.reading.usable ? <NextUp rules={page.rules} place={page.reading.place} /> : null}
      {runs.length === 0 ? null : (
        <List
          title="Recent runs"
          inset
          action={<Button label="See all" variant="text" href={href.automationRuns()} />}
        >
          {runs.slice(0, RECENT).map((run) => (
            <RunRow key={run.id} run={run} timeZone={zone} onOpen={sheet.open} />
          ))}
        </List>
      )}
      {page.ideas.length === 0 ? null : (
        <IdeaRows
          ideas={page.ideas.slice(0, IDEAS)}
          onPick={(idea) => {
            router.push(href.automation('new', idea.id));
          }}
        />
      )}
      {sheet.sheet}
    </>
  );
}

export function AutomationsOverview(): ReactNode {
  const page = useAutomationsPage();
  return (
    <Screen
      maxWidth="reading"
      header={<PageHeader title="Automations" {...subtitleProp(countLine(page.rules))} />}
      {...(page.status.kind === 'ok' ? {} : { banner: <PlaceBanner status={page.status} /> })}
    >
      {page.rules.length === 0 ? <FirstRun ideas={page.ideas} /> : <Overview page={page} />}
    </Screen>
  );
}
