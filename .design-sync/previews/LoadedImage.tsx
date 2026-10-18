import { LoadedImage, Stage } from 'smarteverything-kit';

function gradientUrl(c1: string, c2: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 320, 180);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 320, 180);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(235, 60, 24, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toDataURL('image/png');
}
const frame = (url: string, mode: 'cover' | 'contain') => (
  <div
    style={{ width: 280, height: 160, borderRadius: 12, overflow: 'hidden', position: 'relative' }}
  >
    <LoadedImage url={url} label="Camera snapshot" resizeMode={mode} onError={() => undefined} />
  </div>
);
export const Cover = () => (
  <Stage theme="dark" width={320}>
    {frame(gradientUrl('#2a3b6b', '#e0884b'), 'cover')}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={320}>
    {frame(gradientUrl('#7fb4d9', '#f2d6a0'), 'contain')}
  </Stage>
);
