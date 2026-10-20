import { PLUGIN_ID, type PluginUiRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { Grid } from '../../components/grid';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import { useRow } from '../../store/selectors';
import { BodyView } from './body-view';
import { extensionIcon } from './extension-icon';

const SECTION_MIN_WIDTH = 320;
const SECTION_COLUMNS = 2;

function Sections({
  ui,
  pageId,
}: {
  readonly ui: PluginUiRow;
  readonly pageId: string;
}): ReactNode {
  const page = ui.pages.find((candidate) => candidate.id === pageId);
  if (page === undefined) return <PageGone />;
  return (
    <Screen maxWidth="detail" header={<PageHeader title={page.title} subtitle={ui.name} back />}>
      <Grid minItemWidth={SECTION_MIN_WIDTH} maxColumns={SECTION_COLUMNS}>
        {page.sections.map((section, index) => (
          <Card
            key={`${String(index)}:${section.title}`}
            title={section.title}
            icon={extensionIcon(page.icon)}
          >
            <BodyView pluginId={ui.id} body={section.body} size="W" />
          </Card>
        ))}
      </Grid>
    </Screen>
  );
}

function PageGone(): ReactNode {
  return (
    <Screen maxWidth="detail" header={<PageHeader title="Page not available" back />}>
      <EmptyState
        icon="puzzle"
        title="This page is not available"
        body="The plugin that adds it is switched off or no longer has this page."
        action={<Button label="Back to Home" href={href.home()} variant="tonal" />}
      />
    </Screen>
  );
}

export function ExtensionPageScreen({
  pluginId,
  pageId,
}: {
  readonly pluginId: string;
  readonly pageId: string;
}): ReactNode {
  const ui = useRow('plugin_ui', PLUGIN_ID.safeParse(pluginId).success ? pluginId : null);
  return ui === null ? <PageGone /> : <Sections ui={ui} pageId={pageId} />;
}
