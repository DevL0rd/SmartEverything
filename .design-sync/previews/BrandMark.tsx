import { BrandMark, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const brands = [
  'xiaomi',
  'tuya',
  'smartthings',
  'samsung',
  'google',
  'anthropic',
  'claude',
  'chatgpt',
] as const;
const body = (
  <Row gap={16}>
    {brands.map((b) => (
      <BrandMark key={b} brand={b} size={40} />
    ))}
  </Row>
);
export const Brands = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const Sizes = () => (
  <Stage theme="dark" width={520}>
    <Row gap={16}>
      <BrandMark brand="xiaomi" size={24} />
      <BrandMark brand="xiaomi" size={32} />
      <BrandMark brand="xiaomi" size={40} />
    </Row>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
