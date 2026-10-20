import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { useMinute } from '../../../store/clock';
import { useBrushState } from '../data/brush-data';
import { noticesOf } from '../model/notices';
import { BRUSH_PAGE } from '../search';

function Notices({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const notices = noticesOf(view, useMinute());
  if (notices.length === 0) {
    return null;
  }
  return (
    <View className="gap-2">
      {notices.map((notice) => (
        <Banner
          key={notice.key}
          tone={notice.tone}
          title={notice.title}
          body={notice.body}
          wrapBody
          {...(notice.action === null
            ? {}
            : {
                action: {
                  label: notice.action === 'model' ? 'Choose model' : 'Open settings',
                  href: href.settings.device(deviceId, BRUSH_PAGE),
                },
              })}
        />
      ))}
    </View>
  );
}

export function BrushNotices({ deviceId }: { readonly deviceId: string }): ReactNode {
  const state = useBrushState(deviceId);
  return state.data === undefined ? null : <Notices deviceId={deviceId} view={state.data} />;
}
