import React from 'react';
import { connect } from 'react-redux';
import { Toolbar } from '../redux/toolbar';
import { RootState } from '../redux/types';
import Modal from '../components/Modal';
import styles from './ResetWorkspaceModal.module.css';

interface Props {
  show: boolean;
  onCancel: () => void;
}

function ResetWorkspaceModal({ show, onCancel }: Props) {
  const handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <Modal showModal={show}>
      <div className={styles.container}>
        <h2 className={styles.title}>Reset Workspace</h2>
        <p className={styles.body}>
          This will delete all open documents and reset Petsciishop to its
          default state. This cannot be undone.
        </p>
        <p className={styles.warning}>Are you sure?</p>
        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.resetBtn} onClick={handleReset}>Reset</button>
        </div>
      </div>
    </Modal>
  );
}

export default connect(
  (state: RootState) => ({ show: state.toolbar.showResetConfirm }),
  (dispatch) => ({ onCancel: () => dispatch(Toolbar.actions.setShowResetConfirm(false)) })
)(ResetWorkspaceModal);
