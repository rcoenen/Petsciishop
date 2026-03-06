import React from 'react';
import { connect } from 'react-redux';
import { RootState, ScreenMetadata } from '../redux/types';
import * as selectors from '../redux/selectors';
import * as screensSelectors from '../redux/screensSelectors';
import { Toolbar } from '../redux/toolbar';
import styles from './ScreenInfoPanel.module.css';

const MONTH_CODES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const URL_RE = /(https?:\/\/[^\s]+)/g;

function formatDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return date;
  return `${m[3]}/${MONTH_CODES[monthIdx]}/${m[1]}`;
}

function renderTextWithLinks(text: string): React.ReactNode {
  const parts = text.split(URL_RE);
  return parts.map((part, idx) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={idx} href={part} target="_blank" rel="noreferrer" className={styles.inlineLink}>
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

interface Props {
  metadata?: ScreenMetadata;
  framebufIndex: number | null;
  onEdit: (framebufIndex: number) => void;
}

function ScreenInfoPanel({ metadata, framebufIndex, onEdit }: Props) {
  const name = metadata?.name;
  const author = metadata?.author;
  const date = metadata?.date;
  const description = metadata?.description;
  const hasAny = !!(name || author || date || description);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>File Info</span>
        <button
          className={styles.editBtn}
          onClick={() => framebufIndex !== null && onEdit(framebufIndex)}
          title="Edit screen info"
        >
          Edit
        </button>
      </div>
      {hasAny ? (
        <dl className={styles.fields}>
          {name && <><dt className={styles.label}>Name</dt><dd className={styles.value}>{renderTextWithLinks(name)}</dd></>}
          {author && <><dt className={styles.label}>Author</dt><dd className={styles.value}>{renderTextWithLinks(author)}</dd></>}
          {date && <><dt className={styles.label}>Date</dt><dd className={styles.value}>{formatDate(date)}</dd></>}
          {description && <><dt className={styles.label}>Desc</dt><dd className={styles.value}>{renderTextWithLinks(description)}</dd></>}
        </dl>
      ) : (
        <div className={styles.empty}>No info — click Edit to add.</div>
      )}
    </div>
  );
}

export default connect(
  (state: RootState) => {
    const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state);
    const fb = framebufIndex !== null ? selectors.getFramebufByIndex(state, framebufIndex) : null;
    return {
      metadata: fb?.metadata,
      framebufIndex,
    };
  },
  (dispatch) => ({
    onEdit: (framebufIndex: number) =>
      dispatch(Toolbar.actions.setShowScreenInfo({ show: true, framebufIndex })),
  })
)(ScreenInfoPanel);
