import { ListRow, Section, SectionAction, Stage, Text } from 'smarteverything-kit';

const body = (
  <>
    <Section
      title="Rooms"
      footer="Rooms group devices for scenes and voice control."
      action={<SectionAction label="See all" />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ListRow title="Living room" subtitle="6 devices" icon="home" chevron />
        <ListRow title="Bedroom" subtitle="4 devices" icon="moon" chevron />
      </div>
    </Section>
    <Section title="Notes">
      <Text variant="callout" tone="variant">
        Sections add a heading, optional action and footer around any content.
      </Text>
    </Section>
  </>
);
export const Default = () => (
  <Stage theme="dark" width={460}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    {body}
  </Stage>
);
