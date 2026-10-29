import { describe, expect, it } from 'vitest';
import { niceMax } from './charts.tsx';

describe('niceMax', () => {
  it.each([
    [0, 0],
    [7, 10],
    [12, 20],
    [21, 25],
    [2_049_000, 2_500_000],
    [4_800_000, 5_000_000],
    [5_000_000, 5_000_000],
  ])('%d → %d', (v, expected) => expect(niceMax(v)).toBe(expected));
});
