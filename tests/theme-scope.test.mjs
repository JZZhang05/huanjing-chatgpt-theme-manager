import test from 'node:test';
import assert from 'node:assert/strict';
import {themeSkipReason} from '../src/theme-scope.mjs';

test('native transparent pet and auxiliary surfaces never receive wallpaper', () => {
  for (const url of [
    'app://-/index.html?initialRoute=%2Favatar-overlay',
    'app://-/index.html?initialRoute=%2Favatar-overlay%2Fpet',
    'app://-/avatar-overlay'
  ]) assert.equal(themeSkipReason(url),'avatar-overlay');
  for (const url of [
    'app://-/detached-window.html',
    'app://-/index.html?initialRoute=%2Fdetached-window',
    'app://-/index.html?initialRoute=%2Fdetached-window%2Fpreview'
  ]) assert.equal(themeSkipReason(url),'detached-window');
  for (const url of ['app://-/index.html', 'app://-/index.html?initialRoute=%2Fsettings']) {
    assert.equal(themeSkipReason(url), null);
  }
});
