import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../components/banner';
import type { SectionFailure } from '../store/state';
import { useSectionFailure, useSyncStatus } from '../store/selectors';
import { href, UPDATES_SETTINGS_PAGE } from './hrefs';

export function sectionLabel(section: string): string {
  const name = section.split('.').at(-1);
  if (name === undefined) throw new Error(`The section name ${section} is empty`);
  return name.replaceAll('_', ' ');
}

export function sectionFailureText(failure: SectionFailure): string {
  return `${sectionLabel(failure.section)}: ${failure.reason}`;
}

export function SectionFailureBanner({ section }: { readonly section: string }): ReactNode {
  const failure = useSectionFailure(section);
  if (failure === null) return null;
  return (
    <View className="w-full">
      <Banner
        tone="critical"
        title={`Can’t read ${sectionLabel(section)} from your server`}
        body={`${failure.reason}. Update the app.`}
        wrapBody
        action={{ label: 'Updates', href: href.settings.page(UPDATES_SETTINGS_PAGE) }}
      />
    </View>
  );
}

export function UnreadableSections(): ReactNode {
  const { failed } = useSyncStatus();
  if (failed.length === 0) return null;
  return (
    <Banner
      tone="warning"
      title="This app can’t read part of your server"
      body={`${failed.map(sectionFailureText).join('\n')}\nEverything else works. Install the update to read it.`}
      wrapBody
    />
  );
}
