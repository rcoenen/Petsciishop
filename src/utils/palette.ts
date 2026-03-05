
import { Rgb } from '../redux/types'
import { C64_PALETTES, getPaletteById, paletteToRgb } from './c64Palettes'

// Pre-computed Map: palette id → Rgb[]
const paletteMap = new Map<string, Rgb[]>(
  C64_PALETTES.map(p => [p.id, paletteToRgb(p)])
);

// Legacy keyed object for backward compat (used by Settings UI custom palette reorder)
const obj: Record<string, Rgb[]> = {};
paletteMap.forEach((v, k) => { obj[k] = v; });
export const colorPalettes: Record<string, Rgb[]> = obj;

/** Get an Rgb[] palette by id. Falls back to Colodore. */
export function getColorPaletteById(id: string): Rgb[] {
  return paletteMap.get(id) ?? paletteToRgb(getPaletteById(id));
}
