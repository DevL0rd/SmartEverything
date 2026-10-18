import { Breadcrumbs, Stage } from 'smarteverything-kit';

const crumbs = [
  { label: 'Home', href: '/' },
  { label: 'Living room', href: '/rooms/living' },
  { label: 'Floor lamp' },
];
export const Trail = () => (
  <Stage theme="dark" width={520}>
    <Breadcrumbs crumbs={crumbs} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    <Breadcrumbs crumbs={crumbs} />
  </Stage>
);
