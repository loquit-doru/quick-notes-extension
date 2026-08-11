import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl,
  getHostname,
  noteMatchesCurrentPage,
  noteMatchesCurrentDomain
} from '../../shared/url-utils.js';

describe('normalizeUrl', () => {
  it('removes hash fragments', () => {
    assert.equal(
      normalizeUrl('https://example.com/docs/guide#section-2'),
      'https://example.com/docs/guide'
    );
  });

  it('keeps query params', () => {
    assert.equal(
      normalizeUrl('https://example.com/search?q=notes&page=2#results'),
      'https://example.com/search?q=notes&page=2'
    );
  });

  it('returns null for invalid URLs', () => {
    assert.equal(normalizeUrl('not a url'), null);
    assert.equal(normalizeUrl(''), null);
    assert.equal(normalizeUrl(null), null);
  });
});

describe('getHostname', () => {
  it('extracts hostname and strips www', () => {
    assert.equal(getHostname('https://www.example.com/path'), 'example.com');
    assert.equal(getHostname('https://docs.example.com/page'), 'docs.example.com');
  });

  it('returns null for invalid URLs', () => {
    assert.equal(getHostname(':::'), null);
    assert.equal(getHostname(undefined), null);
  });
});

describe('noteMatchesCurrentPage', () => {
  const tab = { url: 'https://shop.example.com/item/42#reviews' };

  it('matches exact URL without hash', () => {
    const note = { contextUrl: 'https://shop.example.com/item/42' };
    assert.equal(noteMatchesCurrentPage(note, tab), true);
  });

  it('matches when only hash differs', () => {
    const note = { contextUrl: 'https://shop.example.com/item/42#overview' };
    assert.equal(noteMatchesCurrentPage(note, tab), true);
  });

  it('does not match different path', () => {
    const note = { contextUrl: 'https://shop.example.com/item/99' };
    assert.equal(noteMatchesCurrentPage(note, tab), false);
  });

  it('does not match when note has no contextUrl', () => {
    assert.equal(noteMatchesCurrentPage({}, tab), false);
    assert.equal(noteMatchesCurrentPage({ contextUrl: null }, tab), false);
  });
});

describe('noteMatchesCurrentDomain', () => {
  it('matches same hostname', () => {
    const note = { contextUrl: 'https://www.example.com/a' };
    const tab = { url: 'https://example.com/b', hostname: 'example.com' };
    assert.equal(noteMatchesCurrentDomain(note, tab), true);
  });

  it('does not match different hostname', () => {
    const note = { contextUrl: 'https://a.com/page' };
    const tab = { url: 'https://b.com/page', hostname: 'b.com' };
    assert.equal(noteMatchesCurrentDomain(note, tab), false);
  });

  it('does not match when note has no contextUrl', () => {
    assert.equal(noteMatchesCurrentDomain({}, { url: 'https://x.com' }), false);
  });
});
