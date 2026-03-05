import React, { Component } from 'react';
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import { RootState } from '../redux/types'
import { Toolbar } from '../redux/toolbar'
import * as settings from '../redux/settings'
import { bindActionCreators } from 'redux';

const ModalTitle: React.FC<{children?: React.ReactNode}> = ({children}) => <h2>{children}</h2>

interface SettingsStateProps {
  showSettings: boolean;
  integerScale: boolean;
};

interface SettingsDispatchProps  {
  Settings: settings.PropsFromDispatch;
  Toolbar: any;  // TODO ts
}

class Settings_ extends Component<SettingsStateProps & SettingsDispatchProps> {
  handleOK = () => {
    this.props.Toolbar.setShowSettings(false)
    this.props.Settings.saveEdits()
  }

  handleCancel = () => {
    this.props.Toolbar.setShowSettings(false)
    this.props.Settings.cancelEdits()
  }

  handleIntegerScale = (e: any) => {
    this.props.Settings.setIntegerScale({
      branch: 'editing',
      scale: e.target.checked
    });
  }

  render () {
    return (
      <div>
        <Modal showModal={this.props.showSettings}>
          <div style={{
            display: 'flex',
            height: '100%',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflowY: 'auto'
          }}>

            <div>
              <ModalTitle>Preferences</ModalTitle>

              {/*<Title3>View</Title3>
              <div style={{marginTop: '9px'}}>
                <CheckboxInput
                  label='Snap window scale to integers to keep 1x1 pixels.'
                  checked={this.props.integerScale}
                  onChange={this.handleIntegerScale}
                />
              </div>*/}
              <p style={{color: 'rgb(160,160,160)'}}>No configurable preferences at this time.</p>
              <br/>
            </div>

            <div style={{alignSelf: 'flex-end'}}>
              <button className='cancel' onClick={this.handleCancel}>Cancel</button>
              <button className='primary' onClick={this.handleOK}>OK</button>
            </div>
          </div>

        </Modal>
      </div>
    )
  }
}

export default connect(
  (state: RootState) => {
    return {
      showSettings: state.toolbar.showSettings,
      integerScale: false
    }
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
      Settings: bindActionCreators(settings.actions, dispatch)
    }
  }
)(Settings_)
