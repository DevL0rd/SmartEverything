import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { GoogleMark } from './google-mark';
import { GOOGLE_SERVICE_SECTIONS } from './google-sections';
import type { GoogleLinkState } from './link-slot';

function Point({
  text,
  included,
}: {
  readonly text: string;
  readonly included: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-2">
      <Icon name={included ? 'check' : 'close'} size={16} tone={included ? 'positive' : 'faint'} />
      <Text variant="callout" tone={included ? 'default' : 'variant'} className="min-w-0 flex-1">
        {text}
      </Text>
    </View>
  );
}

function LinkAction({
  link,
  subject,
}: {
  readonly link: GoogleLinkState | null;
  readonly subject: string;
}): ReactNode {
  if (link === null) {
    return (
      <Text variant="callout" tone="variant" align="center">
        {`${subject} links Google from their own device.`}
      </Text>
    );
  }
  return (
    <View className="gap-2">
      <Button label="Link Google" icon="link" size="lg" loading={link.busy} onPress={link.start} />
      <Text variant="footnote" tone="variant" align="center">
        Opens Google in your browser. Nothing syncs until you pick calendars.
      </Text>
    </View>
  );
}

export function GoogleIntro({
  link,
  subject,
}: {
  readonly link: GoogleLinkState | null;
  readonly subject: string;
}): ReactNode {
  return (
    <>
      <Card>
        <View className="flex-row items-center gap-3">
          <GoogleMark dot={null} size={40} />
          <View className="min-w-0 flex-1">
            <Text variant="body-strong">
              {GOOGLE_SERVICE_SECTIONS.map((section) => section.title).join(', ')}
            </Text>
            <Text variant="callout" tone="variant">
              Both ways
            </Text>
          </View>
        </View>
        <View className="gap-2">
          {GOOGLE_SERVICE_SECTIONS.map((section) => (
            <Point key={section.id} text={section.summary} included />
          ))}
          <Point text="Pick which calendars sync" included />
          <Point
            text="Google Keep and Google Clock alarms have no public API, so they stay out of sync."
            included={false}
          />
        </View>
      </Card>
      <LinkAction link={link} subject={subject} />
    </>
  );
}
