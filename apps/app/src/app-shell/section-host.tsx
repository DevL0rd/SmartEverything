import { use, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { usePausable } from '../design/external-store';
import { useSizeClass } from '../design/size-class';
import { sectionRailOf } from '../components/page-shell/layout';
import { RailHost } from '../components/page-shell/rail-host';
import { RailHostContext } from '../components/page-shell/rail-host-context';
import { ShellInsetContext } from '../components/page-shell/shell-inset';
import { ShellRail, railFormOf } from '../components/page-shell/shell-sections';

function HostedRail({ host }: { readonly host: RailHost }): ReactNode {
  const sections = usePausable(host.subscribe, host.sections);
  const size = useSizeClass();
  const area = size.area - use(ShellInsetContext);
  if (sections === null) return null;
  const rail = sectionRailOf(size.header === 'large', area, railFormOf(sections));
  if (rail === null) return null;
  return <ShellRail sections={sections} rail={rail} safeTop={size.header !== 'desktop'} />;
}

export function SectionHost({ children }: { readonly children: ReactNode }): ReactNode {
  const [host] = useState(() => new RailHost());
  return (
    <View className="min-h-0 flex-1 flex-row">
      <HostedRail host={host} />
      <View testID="shell-content" className="min-h-0 min-w-0 flex-1">
        <RailHostContext value={host}>{children}</RailHostContext>
      </View>
    </View>
  );
}
