export type ColourMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const IDENTITY_MATRIX: ColourMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export const LUMA = [0.2126, 0.7152, 0.0722] as const;

type Row = readonly [number, number, number, number];

function composedRow(
  [a0, a1, a2, a3]: Row,
  [b0, b1, b2, b3]: Row,
  [c0, c1, c2, c3]: Row,
  [x, y, z, offset]: Row,
): Row {
  return [
    x * a0 + y * b0 + z * c0,
    x * a1 + y * b1 + z * c1,
    x * a2 + y * b2 + z * c2,
    x * a3 + y * b3 + z * c3 + offset,
  ];
}

export function matrixAfter(first: ColourMatrix, second: ColourMatrix): ColourMatrix {
  const [a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3] = first;
  const [d0, d1, d2, d3, e0, e1, e2, e3, f0, f1, f2, f3] = second;
  const rows = [
    [a0, a1, a2, a3],
    [b0, b1, b2, b3],
    [c0, c1, c2, c3],
  ] as const;
  const [r0, r1, r2, r3] = composedRow(rows[0], rows[1], rows[2], [d0, d1, d2, d3]);
  const [g0, g1, g2, g3] = composedRow(rows[0], rows[1], rows[2], [e0, e1, e2, e3]);
  const [h0, h1, h2, h3] = composedRow(rows[0], rows[1], rows[2], [f0, f1, f2, f3]);
  return [r0, r1, r2, r3, g0, g1, g2, g3, h0, h1, h2, h3];
}

function mapMatrix(
  matrix: ColourMatrix,
  change: (value: number, index: number) => number,
): ColourMatrix {
  const [a, b, c, d, e, f, g, h, i, j, k, l] = matrix;
  return [
    change(a, 0),
    change(b, 1),
    change(c, 2),
    change(d, 3),
    change(e, 4),
    change(f, 5),
    change(g, 6),
    change(h, 7),
    change(i, 8),
    change(j, 9),
    change(k, 10),
    change(l, 11),
  ];
}

export function blendMatrix(target: ColourMatrix, strength: number): ColourMatrix {
  return mapMatrix(target, (value, index) => {
    const base = index % 5 === 0 ? 1 : 0;
    return base + (strength / 100) * (value - base);
  });
}

export function scaleMatrix(red: number, green: number, blue: number): ColourMatrix {
  return [red, 0, 0, 0, 0, green, 0, 0, 0, 0, blue, 0];
}

export function gainMatrix(gain: number, offset: number): ColourMatrix {
  return [gain, 0, 0, offset, 0, gain, 0, offset, 0, 0, gain, offset];
}

export function saturationMatrix(factor: number): ColourMatrix {
  const [lr, lg, lb] = LUMA;
  const keep = 1 - factor;
  return [
    lr * keep + factor,
    lg * keep,
    lb * keep,
    0,
    lr * keep,
    lg * keep + factor,
    lb * keep,
    0,
    lr * keep,
    lg * keep,
    lb * keep + factor,
    0,
  ];
}

export function lumaMatrix(gain: number, offset: number): ColourMatrix {
  const [lr, lg, lb] = LUMA;
  const [r, g, b] = [lr * gain, lg * gain, lb * gain];
  return [r, g, b, offset, r, g, b, offset, r, g, b, offset];
}
