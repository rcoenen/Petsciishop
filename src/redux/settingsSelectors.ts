
import { RootState, Settings, PaletteName } from './types'
import { colorPalettes, getColorPaletteById } from '../utils/palette'

export function getSettings(state: RootState): Settings {
  return state.settings['saved']
}

export const getSettingsEditing = (state: RootState) => {
  return state.settings['editing']
}


export const getSettingsColorPaletteByName = (_state: RootState, name: PaletteName) => {
  return getColorPaletteById(name);
}

export const getSettingsCurrentColorPalette = (state: RootState) => {
  const settings = getSettings(state)
  return getSettingsColorPaletteByName(state, settings.selectedColorPalette)
}

export const getSettingsIntegerScale = (state: RootState) => {
  const settings = getSettings(state)
  return settings.integerScale
}

export const getSettingsCrtFilter = (state: RootState) => {
  const settings = getSettings(state)
  return settings.crtFilter
}

export const getSettingsEditingCurrentColorPalette = (state: RootState) => {
  const settings = getSettingsEditing(state)
  return getSettingsColorPaletteByName(state, settings.selectedColorPalette)
}

/** Workspace palette id. Palettes are not stored per file. */
export const getEffectivePaletteId = (state: RootState, _framebufIndex: number | null): string => {
  return getSettings(state).selectedColorPalette;
}

/** Workspace Rgb[] palette used by all open files. */
export const getEffectiveColorPalette = (state: RootState, framebufIndex: number | null) => {
  return getColorPaletteById(getEffectivePaletteId(state, framebufIndex));
}
