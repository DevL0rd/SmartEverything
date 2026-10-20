import sharp from 'sharp';

const WIDTH_PX = 1240;
const SWATCHES = [
  '#00ffff',
  '#ff00ff',
  '#ffff00',
  '#000000',
  '#ff0000',
  '#00ff00',
  '#0000ff',
] as const;
const RAMP_STEPS = 11;
const GRID_LINES = 12;

function escaped(text: string): string {
  return text.replace(/[&<>"']/gu, (char) => `&#${String(char.charCodeAt(0))};`);
}

function swatches(colour: boolean): string {
  const list = colour ? SWATCHES : ['#000000'];
  return list
    .map(
      (fill, index) =>
        `<rect x="${String(15 + index * 25)}" y="70" width="22" height="22" fill="${fill}"/>`,
    )
    .join('');
}

function ramp(): string {
  return Array.from({ length: RAMP_STEPS }, (_, step) => {
    const grey = Math.round((step / (RAMP_STEPS - 1)) * 255);
    return `<rect x="${String(15 + step * 16)}" y="105" width="16" height="16" fill="rgb(${String(grey)},${String(grey)},${String(grey)})"/>`;
  }).join('');
}

function grid(): string {
  const lines: string[] = [];
  for (let line = 0; line <= GRID_LINES; line += 1) {
    const offset = 15 + line * 15;
    lines.push(
      `<line x1="${String(offset)}" y1="140" x2="${String(offset)}" y2="260" stroke="#000" stroke-width="0.2"/>`,
    );
    if (line <= 8)
      lines.push(
        `<line x1="15" y1="${String(140 + line * 15)}" x2="195" y2="${String(140 + line * 15)}" stroke="#000" stroke-width="0.2"/>`,
      );
  }
  return lines.join('');
}

export function testPageSvg(printer: string, date: string, colour: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(WIDTH_PX)}" viewBox="0 0 210 297"><rect width="210" height="297" fill="#fff"/><circle cx="30" cy="35" r="14" fill="none" stroke="#000" stroke-width="1.2"/><circle cx="30" cy="35" r="6" fill="#000"/><text x="52" y="33" font-family="sans-serif" font-size="9" font-weight="bold">SmartEverything</text><text x="52" y="42" font-family="sans-serif" font-size="5">Test page</text>${swatches(colour)}${ramp()}${grid()}<text x="15" y="275" font-family="sans-serif" font-size="5">${escaped(printer)}</text><text x="15" y="283" font-family="sans-serif" font-size="4">${escaped(date)}</text></svg>`;
}

export function testPagePng(printer: string, date: string, colour: boolean): Promise<Buffer> {
  return sharp(Buffer.from(testPageSvg(printer, date, colour)))
    .png()
    .toBuffer();
}
