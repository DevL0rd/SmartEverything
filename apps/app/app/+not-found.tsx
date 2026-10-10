import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, usePathname } from 'expo-router';
import { href } from '../src/app-shell/hrefs';
import { legacyHref } from '../src/app-shell/legacy-routes';
import { Button } from '../src/components/button';
import { EmptyState } from '../src/components/empty-state';

export default function NotFound(): ReactNode {
  const moved = legacyHref(
    usePathname()
      .split('/')
      .filter((part) => part !== ''),
  );
  if (moved !== null) {
    return <Redirect href={moved} />;
  }
  return (
    <View className="flex-1 items-center justify-center">
      <EmptyState
        icon="search"
        title="Page not found"
        body="This page does not exist."
        action={<Button label="Go home" href={href.home()} />}
      />
    </View>
  );
}
