
import { RootState, Settings, PaletteName } from './types'
import { colorPalettes, getColorPaletteById } from '../utils/palette'
import * as selectors from './selectors'

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

/** Per-screen palette id, falling back to global setting. */
export const getEffectivePaletteId = (state: RootState, framebufIndex: number | null): string => {
  if (framebufIndex !== null) {
    const fb = selectors.getFramebufByIndex(state, framebufIndex);
    if (fb?.paletteId) {
      return fb.paletteId;
    }
  }
  return getSettings(state).selectedColorPalette;
}

/** Per-screen Rgb[] palette, falling back to global setting. */
export const getEffectiveColorPalette = (state: RootState, framebufIndex: number | null) => {
  return getColorPaletteById(getEffectivePaletteId(state, framebufIndex));
}
