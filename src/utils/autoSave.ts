import { buildWorkspaceJson } from './index';
import * as selectors from '../redux/selectors';
import * as screensSelectors from '../redux/screensSelectors';
import { RootState } from '../redux/types';

const AUTO_SAVE_KEY = 'petsciishop-autosave';
const DEBOUNCE_MS = 1_000;

export function startAutoSave(getState: () => RootState, subscribe: (cb: () => void) => () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    try {
      const state = getState();
      const screens = screensSelectors.getScreens(state);
      const getFramebufById = (fbid: number) => selectors.getFramebufByIndex(state, fbid)!;
      const cf = selectors.getCustomFonts(state);
      const json = buildWorkspaceJson(screens, getFramebufById, cf);
      localStorage.setItem(AUTO_SAVE_KEY, json);
    } catch (e) {
      console.warn('Auto-save failed:', e);
    }
  };

  const unsubscribe = subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

export function loadAutoSave(): string | null {
  return localStorage.getItem(AUTO_SAVE_KEY);
}

export function clearAutoSave(): void {
  localStorage.removeItem(AUTO_SAVE_KEY);
}
