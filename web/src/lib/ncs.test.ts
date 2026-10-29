import { describe, expect, it } from 'vitest';
import { ncsToHex, parseNcs, swatchFor } from './ncs.ts';

describe('parseNcs', () => {
  it('läser de vanliga skrivsätten, med och utan NCS och S, versaler och blanksteg', () => {
    const expected = {
      blackness: 10,
      chromaticness: 50,
      hue: { from: 'Y', to: 'R', percent: 90 },
    };
    for (const code of [
      'NCS S 1050-Y90R',
      'ncs s 1050-y90r',
      'NCS S 1050 - Y90R',
      'NCS 1050-Y90R',
      'S 1050-Y90R',
      'S1050-Y90R',
      '  NCS S 1050-Y90R  ',
    ]) {
      expect(parseNcs(code), code).toEqual(expected);
    }
  });

  it('läser rena kulörtoner som 0 procent mot nästa', () => {
    expect(parseNcs('NCS S 0502-Y')).toEqual({
      blackness: 5,
      chromaticness: 2,
      hue: { from: 'Y', to: 'R', percent: 0 },
    });
    expect(parseNcs('NCS S 2030-G')?.hue).toEqual({ from: 'G', to: 'Y', percent: 0 });
  });

  it('läser grått (N), som saknar kulörton', () => {
    expect(parseNcs('NCS S 1500-N')).toEqual({ blackness: 15, chromaticness: 0, hue: null });
  });

  it('godkänner bara kulörtoner som följer på varandra: Y→R→B→G→Y', () => {
    for (const ok of ['S 1050-Y50R', 'S 1050-R50B', 'S 1050-B50G', 'S 1050-G50Y']) {
      expect(parseNcs(ok), ok).not.toBeNull();
    }
    for (const bad of ['S 1050-Y50B', 'S 1050-R50Y', 'S 1050-B50Y', 'S 1050-G50R', 'S 1050-Y50Y']) {
      expect(parseNcs(bad), bad).toBeNull();
    }
  });

  it('godkänner svart plus kulörthet upp till och med 100, men inte över', () => {
    expect(parseNcs('NCS S 6040-Y')).not.toBeNull();
    expect(parseNcs('NCS S 6041-Y')).toBeNull();
    expect(parseNcs('NCS S 9999-Y')).toBeNull();
  });

  it('nekar felaktiga koder och sådant som inte är NCS', () => {
    for (const bad of [
      '',
      null,
      undefined,
      'RAL 9010',
      'Alcro 1234',
      '#F2EFE8',
      'NCS S 1050', // kulörton saknas
      'NCS S 10-Y', // för få siffror
      'NCS S 1050-N', // grått kan inte ha kulörthet
      'NCS S 1050-Y0R', // 0 procent skrivs som ren färg: Y
      'NCS S 1050-Y100R',
    ]) {
      expect(parseNcs(bad), String(bad)).toBeNull();
    }
  });
});

describe('ncsToHex', () => {
  it('ger exakta grånyanser för N-koder: vitt minus andelen svart', () => {
    // "05" är 5 % svart, så NCS vitaste grå blir 95 % av 255.
    expect(ncsToHex('NCS S 0500-N')).toBe('#F2F2F2');
    expect(ncsToHex('NCS S 1500-N')).toBe('#D9D9D9');
    expect(ncsToHex('NCS S 5000-N')).toBe('#808080');
    expect(ncsToHex('NCS S 9000-N')).toBe('#1A1A1A');
  });

  it('ger en nästan vit nyans med svag gul ton för S 0502-Y', () => {
    expect(ncsToHex('NCS S 0502-Y')).toBe('#F2F1ED');
  });

  it('ger samma färg oavsett skrivsätt', () => {
    const a = ncsToHex('NCS S 1050-Y90R');
    expect(a).toMatch(/^#[0-9A-F]{6}$/);
    for (const code of ['ncs s 1050-y90r', 'NCS 1050-Y90R', 'S1050-Y90R']) {
      expect(ncsToHex(code), code).toBe(a);
    }
  });

  it('låter kulörtonen styra riktningen: mer rött ju närmare R, mer grönt ju närmare Y', () => {
    const rgb = (code: string) => {
      const h = ncsToHex(code)!;
      return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
    };
    const [, gYellowish] = rgb('NCS S 1070-Y10R');
    const [, gReddish] = rgb('NCS S 1070-Y90R');
    expect(gYellowish).toBeGreaterThan(150);
    expect(gReddish).toBeLessThan(80);

    const [rBlue, gBlue, bBlue] = rgb('NCS S 2030-B');
    expect(bBlue).toBeGreaterThan(rBlue);
    expect(bBlue).toBeGreaterThan(gBlue);
    const [rGreen, gGreen, bGreen] = rgb('NCS S 2030-G');
    expect(gGreen).toBeGreaterThan(rGreen);
    expect(gGreen).toBeGreaterThan(bGreen);
    const [rRed, gRed, bRed] = rgb('NCS S 2030-R');
    expect(rRed).toBeGreaterThan(gRed);
    expect(rRed).toBeGreaterThan(bRed);
  });

  it('blir mörkare med mer svart och ljusare med mer vitt', () => {
    const lum = (code: string) => {
      const h = ncsToHex(code)!;
      return [1, 3, 5].reduce((sum, i) => sum + parseInt(h.slice(i, i + 2), 16), 0);
    };
    expect(lum('NCS S 8010-Y90R')).toBeLessThan(lum('NCS S 4010-Y90R'));
    expect(lum('NCS S 4010-Y90R')).toBeLessThan(lum('NCS S 0510-Y90R'));
  });

  it('ger null för sådant som inte är NCS', () => {
    expect(ncsToHex('RAL 9010')).toBeNull();
    expect(ncsToHex(null)).toBeNull();
  });
});

describe('swatchFor', () => {
  it('låter en angiven färgruta gälla före en uträknad', () => {
    expect(swatchFor('#112233', 'NCS S 1500-N')).toEqual({ hex: '#112233', approximate: false });
  });

  it('räknar ut en ungefärlig färg ur NCS-koden när färgruta saknas', () => {
    expect(swatchFor(null, 'NCS S 1500-N')).toEqual({ hex: '#D9D9D9', approximate: true });
    expect(swatchFor('', 'NCS S 1500-N')).toEqual({ hex: '#D9D9D9', approximate: true });
  });

  it('ger ingenting när varken färgruta eller NCS-kod finns', () => {
    expect(swatchFor(null, 'Alcro 1234')).toBeNull();
    expect(swatchFor(null, null)).toBeNull();
  });
});
