import type { ReactNode } from 'react';
import { Banner } from '../../components/banner';
import { href } from '../../app-shell/hrefs';
import type { StatusTone } from '../../components/tone';

export interface PluginNoticeText {
  readonly tone: StatusTone;
  readonly title: string;
  readonly body: string;
  readonly settings: boolean;
}

export function PluginNotice({
  pluginId,
  notice,
}: {
  readonly pluginId: string;
  readonly notice: PluginNoticeText | null;
}): ReactNode {
  if (notice === null) {
    return null;
  }
  return (
    <Banner
      tone={notice.tone}
      title={notice.title}
      body={notice.body}
      {...(notice.settings
        ? { action: { label: 'Open settings', href: href.pluginSettings(pluginId) } }
        : {})}
    />
  );
}

export function StreamProblem({ reason }: { readonly reason: string }): ReactNode {
  return <Banner tone="critical" title="This page could not read the latest data" body={reason} />;
}
