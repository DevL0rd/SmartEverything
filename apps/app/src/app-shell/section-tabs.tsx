import type { ReactNode } from 'react';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useColour } from '../design/colour';
import { screenPause } from './screen-pause';
import { useSectionPrewarm } from './tab-prewarm';

function SectionPrewarm(props: BottomTabBarProps): null {
  useSectionPrewarm(props);
  return null;
}

function renderPrewarm(props: BottomTabBarProps): ReactNode {
  return <SectionPrewarm {...props} />;
}

export function SectionTabs({ sections }: { readonly sections: readonly string[] }): ReactNode {
  const scene = { backgroundColor: useColour('bg') };
  return (
    <Tabs
      tabBar={renderPrewarm}
      backBehavior="initialRoute"
      screenLayout={screenPause}
      screenOptions={{ headerShown: false, lazy: true, freezeOnBlur: false, sceneStyle: scene }}
    >
      {sections.map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}
