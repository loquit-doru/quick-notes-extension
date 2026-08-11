import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_STATUS } from '../../shared/config.js';
import {
  applyListFilters,
  countNeedsReview,
  getMigratedReviewStatus,
  getNewNoteReviewStatus,
  isArchivedNote,
  isBrowsableNote
} from '../../shared/note-filters.js';

const sampleNotes = () => [
  { id: '1', reviewStatus: REVIEW_STATUS.NEW, contextUrl: 'https://a.com/1' },
  { id: '2', reviewStatus: REVIEW_STATUS.REVIEWED, contextUrl: 'https://a.com/2' },
  { id: '3', reviewStatus: REVIEW_STATUS.ARCHIVED, contextUrl: 'https://b.com/3' },
  { id: '4', reviewStatus: REVIEW_STATUS.NEW, contextUrl: 'https://b.com/4' },
  { id: '5', title: 'legacy' }
];

describe('reviewStatus defaults and migration', () => {
  it('new notes default to "new"', () => {
    assert.equal(getNewNoteReviewStatus(), REVIEW_STATUS.NEW);
  });

  it('existing notes without reviewStatus migrate to "reviewed"', () => {
    assert.equal(getMigratedReviewStatus({ id: 'x' }), REVIEW_STATUS.REVIEWED);
    assert.equal(getMigratedReviewStatus({ reviewStatus: null }), REVIEW_STATUS.REVIEWED);
  });

  it('preserves explicit reviewStatus on migration helper', () => {
    assert.equal(
      getMigratedReviewStatus({ reviewStatus: REVIEW_STATUS.NEW }),
      REVIEW_STATUS.NEW
    );
  });
});

describe('applyListFilters', () => {
  it('default list hides archived notes', () => {
    const result = applyListFilters(sampleNotes(), { listViewFilter: 'default' });
    const ids = result.map((n) => n.id);
    assert.ok(!ids.includes('3'));
    assert.equal(result.length, 4);
  });

  it('archived view shows only archived', () => {
    const result = applyListFilters(sampleNotes(), { listViewFilter: 'archived' });
    assert.deepEqual(result.map((n) => n.id), ['3']);
  });

  it('needs-review shows only reviewStatus "new" (not archived)', () => {
    const result = applyListFilters(sampleNotes(), { listViewFilter: 'needs-review' });
    assert.deepEqual(result.map((n) => n.id).sort(), ['1', '4']);
    assert.ok(result.every((n) => n.reviewStatus === REVIEW_STATUS.NEW));
  });

  it('legacy note without reviewStatus is not in needs-review', () => {
    const legacy = { id: 'legacy' };
    const needs = applyListFilters([legacy], { listViewFilter: 'needs-review' });
    assert.equal(needs.length, 0);
  });

  it('after migration, legacy note is reviewed and excluded from needs-review', () => {
    const legacy = { id: 'legacy' };
    const migrated = { ...legacy, reviewStatus: getMigratedReviewStatus(legacy) };
    assert.equal(migrated.reviewStatus, REVIEW_STATUS.REVIEWED);
    const needs = applyListFilters([migrated], { listViewFilter: 'needs-review' });
    assert.equal(needs.length, 0);
  });
});

describe('countNeedsReview', () => {
  it('counts only new non-archived notes', () => {
    assert.equal(countNeedsReview(sampleNotes()), 2);
  });
});

describe('isBrowsableNote / isArchivedNote', () => {
  it('archived is not browsable', () => {
    const archived = { reviewStatus: REVIEW_STATUS.ARCHIVED };
    assert.equal(isArchivedNote(archived), true);
    assert.equal(isBrowsableNote(archived), false);
  });
});
