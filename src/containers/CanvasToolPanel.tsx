
import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators, Dispatch } from 'redux';
import { RootState } from '../redux/types';
import { Toolbar } from '../redux/toolbar';
import s from './CanvasToolPanel.module.css';

interface Props {
  canvasGrid: boolean;
  canvasGridBrightness: number;
  setCanvasGrid: (flag: boolean) => void;
  setCanvasGridBrightness: (v: number) => void;
}

function CanvasToolPanel({ canvasGrid, canvasGridBrightness, setCanvasGrid, setCanvasGridBrightness }: Props) {
  const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const sliderIndex = Math.round(canvasGridBrightness * 10);

  return (
    <>
      <label className={s.gridToggle}>
        <input
          type="checkbox"
          checked={canvasGrid}
          onChange={e => setCanvasGrid(e.target.checked)}
        />
        <span>Grid</span>
      </label>
      {canvasGrid && (
        <label className={s.brightnessLabel}>
          <span className={s.brightnessText}>Brightness</span>
          <input
            type="range"
            className={s.brightnessSlider}
            min={0}
            max={10}
            step={1}
            value={sliderIndex}
            onChange={e => setCanvasGridBrightness(steps[parseInt(e.target.value)])}
          />
          <span className={s.brightnessValue}>{Math.round(canvasGridBrightness * 100)}%</span>
        </label>
      )}
    </>
  );
}

export default connect(
  (state: RootState) => ({
    canvasGrid: state.toolbar.canvasGrid,
    canvasGridBrightness: state.toolbar.canvasGridBrightness,
  }),
  (dispatch: Dispatch) => bindActionCreators({
    setCanvasGrid: Toolbar.actions.setCanvasGrid,
    setCanvasGridBrightness: Toolbar.actions.setCanvasGridBrightness,
  }, dispatch)
)(CanvasToolPanel);
