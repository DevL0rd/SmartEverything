import { describe, expect, it } from 'vitest';
import { countriesIn, countryShades, countryShapes } from './countries';
import { project, WORLD_VIEW } from './projection';

describe('Natural Earth 110m countries', () => {
  it('parses every country of the bundled outline once', () => {
    const shapes = countryShapes();
    expect(shapes).toHaveLength(177);
    expect(new Set(shapes.map((shape) => shape.code)).size).toBe(177);
    expect(shapes.map((shape) => shape.code)).toEqual(
      expect.arrayContaining(['FR', 'NO', 'PT', 'US', 'AU', 'CYN', 'SOL', 'AQ']),
    );
    expect(countryShapes()).toBe(shapes);
  });

  it('keeps each outline inside its box', () => {
    const portugal = countryShapes().find((shape) => shape.code === 'PT');
    const lisbon = project({ lat: 38.72, lon: -9.14 });
    expect(portugal?.box[0]).toBeLessThanOrEqual(lisbon.x);
    expect(portugal?.box[2]).toBeGreaterThanOrEqual(lisbon.x);
    expect(portugal?.box[1]).toBeLessThanOrEqual(lisbon.y);
    expect(portugal?.box[3]).toBeGreaterThanOrEqual(lisbon.y);
  });

  it('draws only the countries a view touches', () => {
    const world = countriesIn(WORLD_VIEW).map((shape) => shape.code);
    expect(world).toHaveLength(176);
    expect(world).not.toContain('AQ');
    const iberia = countriesIn({ x: 1600, y: 460, width: 200, height: 120 }).map(
      (shape) => shape.code,
    );
    expect(iberia).toEqual(expect.arrayContaining(['PT', 'ES']));
    expect(iberia).not.toContain('AU');
    expect(iberia).not.toContain('US');
  });

  it('shades visited countries from 20 to 80 percent by their share of the most photos', () => {
    const shades = countryShades([
      { countryCode: 'PT', count: 400 },
      { countryCode: 'JP', count: 100 },
      { countryCode: 'US', count: 0 },
    ]);
    expect(shades.get('PT')).toBeCloseTo(0.8);
    expect(shades.get('JP')).toBeCloseTo(0.35);
    expect(shades.has('US')).toBe(false);
    expect(countryShades([]).size).toBe(0);
  });
});
