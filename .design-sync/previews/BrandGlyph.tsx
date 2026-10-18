import { BrandGlyph, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const brands = [
  'xiaomi',
  'tuya',
  'smartthings',
  'samsung',
  'google',
  'anthropic',
  'meta',
  'mistral',
  'deepseek',
] as const;
const body = (
  <Row gap={16}>
    {brands.map((b) => (
      <BrandGlyph key={b} brand={b} size={28} />
    ))}
  </Row>
);
export const Glyphs = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
