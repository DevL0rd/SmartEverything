import { Card, Grid, Stage, Text } from 'smarteverything-kit';

const cards = ['Living room', 'Bedroom', 'Kitchen', 'Office', 'Garage', 'Garden'].map((r, i) => (
  <Card key={r} title={r} icon="home">
    <Text variant="callout" tone="variant">
      {4 + i} devices online
    </Text>
  </Card>
));
export const Responsive = () => (
  <Stage theme="dark" width={720}>
    <Grid minItemWidth={200}>{cards}</Grid>
  </Stage>
);
export const TightMaxTwo = () => (
  <Stage theme="dark" width={720}>
    <Grid minItemWidth={160} gap="tight" maxColumns={2}>
      {cards.slice(0, 4)}
    </Grid>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={720}>
    <Grid minItemWidth={200}>{cards}</Grid>
  </Stage>
);
