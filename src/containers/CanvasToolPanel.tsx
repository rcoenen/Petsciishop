
import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators, Dispatch } from 'redux';
import { RootState } from '../redux/types';
import { Toolbar } from '../redux/toolbar';
import * as selectors from '../redux/selectors';
import * as screensSelectors from '../redux/screensSelectors';
import { getEffectiveColorPalette } from '../redux/settingsSelectors';
import { openBezelPreview } from '../utils/bezelPreview';
import s from './CanvasToolPanel.module.css';

interface Props {
  canvasGridBrightness: number;
  setCanvasGridBrightness: (v: number) => void;
  onBezelPreview: () => void;
}

function CanvasToolPanel({ canvasGridBrightness, setCanvasGridBrightness, onBezelPreview }: Props) {
  const sliderValue = Math.round(canvasGridBrightness * 10);

  return (
    <>
      <label className={s.brightnessLabel}>
        <span className={s.brightnessText}>Grid</span>
        <input
          type="range"
          className={s.brightnessSlider}
          min={0}
          max={10}
          step={1}
          value={sliderValue}
          onChange={e => setCanvasGridBrightness(parseInt(e.target.value) / 10)}
        />
        <span className={s.brightnessValue}>{sliderValue}</span>
      </label>
      <button className={s.previewBtn} onClick={onBezelPreview}>
        Preview
      </button>
    </>
  );
}

export default connect(
  (state: RootState) => ({
    canvasGridBrightness: state.toolbar.canvasGridBrightness,
  }),
  (dispatch: Dispatch) => ({
    ...bindActionCreators({
      setCanvasGridBrightness: Toolbar.actions.setCanvasGridBrightness,
    }, dispatch),
    onBezelPreview: () => (dispatch as any)((dispatch: any, getState: any) => {
      const state = getState();
      const fb = selectors.getCurrentFramebuf(state);
      if (!fb) return;
      const { font } = selectors.getCurrentFramebufFont(state);
      const palette = getEffectiveColorPalette(state, screensSelectors.getCurrentScreenFramebufIndex(state));
      openBezelPreview({ ...fb, font }, palette);
    }),
  })
)(CanvasToolPanel);
