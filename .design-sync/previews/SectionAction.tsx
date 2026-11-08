import type { ReactElement } from 'react';
import { SectionAction, Section, Stage, Text } from 'smarteverything-kit';

const body = (
  <Section title="Automations" action={<SectionAction label="Add automation" />}>
    <Text variant="callout" tone="variant">
      Evening lights, Away mode, Wake up
    </Text>
  </Section>
);
export const InSection = (): ReactElement => (
  <Stage theme="dark" width={460}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={460}>
    {body}
  </Stage>
);
