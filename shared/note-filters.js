// Pure list/review filter helpers (no DOM, no chrome APIs)

import { REVIEW_STATUS } from './config.js';
import { noteMatchesCurrentDomain, noteMatchesCurrentPage } from './url-utils.js';

export function isArchivedNote(note) {
  return note?.reviewStatus === REVIEW_STATUS.ARCHIVED;
}

export function isBrowsableNote(note) {
  return !isArchivedNote(note);
}

/** Default reviewStatus for notes created via db.createNote(). */
export function getNewNoteReviewStatus() {
  return REVIEW_STATUS.NEW;
}

/** reviewStatus applied when migrating legacy notes without the field. */
export function getMigratedReviewStatus(note) {
  return note?.reviewStatus ?? REVIEW_STATUS.REVIEWED;
}

/**
 * Filter notes for list views (default, needs-review, archived, page, site).
 * @param {Array<object>} noteList
 * @param {{ listViewFilter?: string, tabContext?: object|null }} options
 */
export function applyListFilters(noteList, options = {}) {
  const { listViewFilter = 'default', tabContext = null } = options;
  let result = [...noteList];

  if (listViewFilter === 'archived') {
    return result.filter(isArchivedNote);
  }

  result = result.filter(isBrowsableNote);

  if (listViewFilter === 'needs-review') {
    return result.filter((n) => n.reviewStatus === REVIEW_STATUS.NEW);
  }
  if (listViewFilter === 'page' && tabContext) {
    return result.filter((n) => noteMatchesCurrentPage(n, tabContext));
  }
  if (listViewFilter === 'site' && tabContext) {
    return result.filter((n) => noteMatchesCurrentDomain(n, tabContext));
  }

  return result;
}

/** Count of notes that would show in Inbox pill. */
export function countNeedsReview(notes) {
  return notes.filter((n) => n.reviewStatus === REVIEW_STATUS.NEW && isBrowsableNote(n)).length;
}
