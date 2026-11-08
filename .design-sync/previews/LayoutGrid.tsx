import type { ReactNode } from 'react';
import { Card, LayoutGrid, Stage, Text } from 'smarteverything-kit';

const cards = ['Living room', 'Bedroom', 'Kitchen', 'Office', 'Garage', 'Garden'].map((r, i) => (
  <Card key={r} title={r} icon="home">
    <Text variant="callout" tone="variant">
      {4 + i} devices online
    </Text>
  </Card>
));
export const Responsive = (): ReactNode => (
  <Stage theme="dark" width={720}>
    <LayoutGrid minItemWidth={200}>{cards}</LayoutGrid>
  </Stage>
);
export const TightMaxTwo = (): ReactNode => (
  <Stage theme="dark" width={720}>
    <LayoutGrid minItemWidth={160} gap="tight" maxColumns={2}>
      {cards.slice(0, 4)}
    </LayoutGrid>
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={720}>
    <LayoutGrid minItemWidth={200}>{cards}</LayoutGrid>
  </Stage>
);
