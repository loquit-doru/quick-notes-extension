import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STORE_REVIEW_URLS, getStoreReviewUrl } from '../../shared/config.js';

const CHROME_ID = 'nompejhpnnehhnedkgklfgpdgcfhkfem';
const EDGE_ID = 'bpflnjinelkgbnbbjjddggnahdjhmadn';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const EDGE_UA = `${CHROME_UA} Edg/140.0.0.0`;

describe('getStoreReviewUrl', () => {
  it('resolves the Chrome listing from the Chrome extension id', () => {
    assert.equal(getStoreReviewUrl(CHROME_ID, EDGE_UA), STORE_REVIEW_URLS[CHROME_ID]);
  });

  it('resolves the Edge listing from the Edge extension id', () => {
    assert.equal(getStoreReviewUrl(EDGE_ID, CHROME_UA), STORE_REVIEW_URLS[EDGE_ID]);
  });

  it('prefers the extension id over the user agent', () => {
    // An Edge build opened in a Chrome-looking context must still point at Edge.
    assert.equal(getStoreReviewUrl(EDGE_ID, CHROME_UA), STORE_REVIEW_URLS[EDGE_ID]);
  });

  it('falls back to Edge when the id is unknown and the UA says Edg', () => {
    assert.equal(getStoreReviewUrl('unpacked-dev-id', EDGE_UA), STORE_REVIEW_URLS[EDGE_ID]);
  });

  it('does not mistake Edge for Chrome — Edge reports both tokens', () => {
    assert.ok(EDGE_UA.includes('Chrome/'));
    assert.notEqual(getStoreReviewUrl('', EDGE_UA), STORE_REVIEW_URLS[CHROME_ID]);
  });

  it('falls back to Chrome when the id is unknown and the UA says Chrome only', () => {
    assert.equal(getStoreReviewUrl('unpacked-dev-id', CHROME_UA), STORE_REVIEW_URLS[CHROME_ID]);
  });

  it('returns null when neither the id nor the UA identifies a store', () => {
    assert.equal(getStoreReviewUrl('', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0'), null);
    assert.equal(getStoreReviewUrl(undefined, ''), null);
  });

  it('points the Chrome listing straight at the reviews tab', () => {
    assert.match(STORE_REVIEW_URLS[CHROME_ID], /\/reviews$/);
  });
});
