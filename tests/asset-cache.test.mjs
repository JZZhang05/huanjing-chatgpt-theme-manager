import test from 'node:test';
import assert from 'node:assert/strict';
import {AssetCache} from '../src/asset-cache.mjs';

test('evicts least recently used video data and respects byte budget', () => {
  const cache = new AssetCache(12);
  cache.set('a', 'aaaa');
  cache.set('b', 'bbbb');
  cache.set('c', 'cccc');
  assert.equal(cache.get('a'), 'aaaa');
  cache.set('d', 'dddd');
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 'aaaa');
  assert.equal(cache.bytes, 12);
  cache.set('a', '12345678');
  assert.ok(cache.bytes <= 12);
  assert.equal(cache.get('a'), '12345678');
});
test('oversized wallpaper is not retained and UTF-8 cost is counted', () => {
  const cache = new AssetCache(4);
  cache.set('small', '1234');
  cache.set('large', '12345');
  assert.equal(cache.get('large'), undefined);
  assert.equal(cache.get('small'), '1234');
  cache.set('unicode', '紫');
  assert.equal(cache.bytes, 3);
  assert.equal(cache.size, 1);
  assert.throws(() => new AssetCache(-1), RangeError);
});
test('hundreds of wallpaper changes remain bounded', () => {
  const cache = new AssetCache(1024);
  for (let i=0; i<500; i++) {
    cache.set(String(i), 'x'.repeat(200));
    assert.ok(cache.bytes <= 1024);
    assert.ok(cache.size <= 5);
  }
});
