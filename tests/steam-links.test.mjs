import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSteamLinks} from '../src/wallpaper-import.mjs';

test('accepts Steam links, escaped links, IDs and deduplicates concatenated links', () => {
  const a='https://steamcommunity.com/sharedfiles/filedetails/?id=3748398863';
  const b='https://steamcommunity.com/sharedfiles/filedetails/?id=3421437923';
  assert.deepEqual(parseSteamLinks(a+b+' '+a), ['3748398863','3421437923']);
  assert.deepEqual(parseSteamLinks(a.replace('https:', 'https\\:')), ['3748398863']);
  assert.deepEqual(parseSteamLinks('steam://url/CommunityFilePage/3748398863'), ['3748398863']);
  assert.deepEqual(parseSteamLinks('3748398863'), ['3748398863']);
});
test('rejects other hosts, credentials, duplicate IDs, executable URLs and excessive batches', () => {
  for (const raw of [
    '', 'file:///C:/secret', 'https://example.com/?id=3748398863',
    'https://steamcommunity.com.evil.test/sharedfiles/filedetails/?id=3748398863',
    'https://user@steamcommunity.com/sharedfiles/filedetails/?id=3748398863',
    'https://steamcommunity.com:444/sharedfiles/filedetails/?id=3748398863',
    'https://steamcommunity.com/sharedfiles/filedetails/?id=3748398863&id=3421437923',
    'https://steamcommunity.com/sharedfiles/filedetails/?id=../secret',
    'javascript:alert(1)',
    Array.from({length:11},(_,i)=>'https://steamcommunity.com/sharedfiles/filedetails/?id='+(100000+i)).join(' ')
  ]) assert.throws(() => parseSteamLinks(raw), raw);
});
