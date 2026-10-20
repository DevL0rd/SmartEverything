import { BRUSH_BRANDS, ORALB_MODES, SONICARE_MODES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { BRAND_UI, brandOfModel, brandUi } from './brands';

describe('the brand registry', () => {
  it('has an entry for every brand', () => {
    expect(Object.keys(BRAND_UI).sort()).toEqual([...BRUSH_BRANDS].sort());
  });

  it('reads the brand from the model key', () => {
    expect(brandOfModel('philips.toothbrush.hx992x')).toBe('sonicare');
    expect(brandOfModel('oralb.toothbrush.io32')).toBe('oralb');
  });

  it('labels the pressure the way each brush does', () => {
    const sonicare = brandUi('sonicare').pressure;
    const oralb = brandUi('oralb').pressure;
    expect([sonicare.no_contact.label, sonicare.optimal.label, sonicare.too_high.label]).toEqual([
      'No contact',
      'Just right',
      'Too hard',
    ]);
    expect([oralb.no_contact.label, oralb.optimal.label, oralb.too_high.label]).toEqual([
      'Light',
      'Good',
      'Too hard',
    ]);
    expect(sonicare.too_high.colour).toBe('viz-violet');
    expect(oralb.too_high.colour).toBe('critical');
    expect(oralb.too_high.tone).toBe('critical');
  });

  it('colours every mode of a brush and none of them the same', () => {
    const sonicare = SONICARE_MODES.map(brandUi('sonicare').modeColour);
    const oralb = ORALB_MODES.map(brandUi('oralb').modeColour);
    expect(new Set(sonicare).size).toBe(SONICARE_MODES.length);
    expect(new Set(oralb).size).toBe(ORALB_MODES.length);
  });

  it('skips the pair step for Oral-B and keeps it for Sonicare', () => {
    expect(brandUi('sonicare').setupSteps.steps).toContain('pair');
    expect(brandUi('sonicare').setupSteps.PairStep).not.toBeNull();
    expect(brandUi('oralb').setupSteps.steps).not.toContain('pair');
    expect(brandUi('oralb').setupSteps.PairStep).toBeNull();
  });

  it('offers a model choice only where the brush needs one', () => {
    expect(brandUi('sonicare').modelChoices.length).toBeGreaterThan(0);
    expect(brandUi('oralb').modelChoices).toEqual([]);
  });
});
