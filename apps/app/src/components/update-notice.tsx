import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner, type BannerProps } from './banner';
import { Text } from './text';

export interface UpdateNoticeProps extends Omit<BannerProps, 'appearance'> {
  readonly brief?: string | undefined;
}

export function UpdateNotice({ brief, children, ...props }: UpdateNoticeProps): ReactNode {
  return (
    <View className="shell-update-gutter shrink-0 bg-chrome">
      <Banner {...props} appearance="shell">
        {brief === undefined ? (
          children
        ) : (
          <>
            <Text variant="footnote" tone="variant" className="pl-6">
              {brief}
            </Text>
            {children}
          </>
        )}
      </Banner>
    </View>
  );
}
