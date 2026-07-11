const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RealDebridClient,
  RealDebridAvailabilityCache,
  decorateStreamsForRealDebrid,
  resolveRealDebridStream,
} = require('../src/realdebrid');

test('availability cache remembers exact selected file sets and expires entries', () => {
  let now = 1_000;
  const cache = new RealDebridAvailabilityCache({ now: () => now, ttlMs: 100 });

  cache.remember('ABC', [2]);
  assert.equal(cache.has('abc', 1), true);
  assert.equal(cache.has('abc', 0), false);

  now = 1_101;
  assert.equal(cache.has('abc', 1), false);
});

test('decorates RD streams while always retaining a magnet-copy stream', () => {
  const cache = new RealDebridAvailabilityCache();
  cache.remember('cachedhash', [3]);
  const streams = [
    { infoHash: 'cachedhash', fileIdx: 2, seeders: 0, name: 'Jackett\n1080p', title: 'Cached' },
    { infoHash: 'newhash', fileIdx: 0, seeders: 4, name: 'Jackett\n720p', title: 'New' },
  ];

  const result = decorateStreamsForRealDebrid(streams, {
    token: 'token',
    baseUrl: 'http://addon/config',
    availabilityCache: cache,
  });

  assert.equal(result.length, 4);
  assert.match(result[0].name, /^\[RD\+\]/);
  assert.match(result[0].url, /\/realdebrid\/play\/cachedhash\/2\/Cached$/);
  assert.equal(result[0].infoHash, undefined);
  assert.match(result[1].name, /^\[Magnet\]/);
  assert.equal(result[1].infoHash, 'cachedhash');
  assert.deepEqual(result[1].sources, streams[0].sources);
  assert.match(result[2].name, /^\[RD download\]/);
  assert.match(result[3].name, /^\[Magnet\]/);
});

test('each RD stream has a magnet-copy companion', () => {
  const stream = { infoHash: 'hash', fileIdx: 0, seeders: 1, name: 'Jackett\n720p', title: 'Release' };
  const result = decorateStreamsForRealDebrid([stream], {
    token: 'token',
    baseUrl: 'http://addon/config',
    availabilityCache: new RealDebridAvailabilityCache(),
  });

  assert.equal(result.length, 2);
  assert.match(result[0].name, /^\[RD download\]/);
  assert.match(result[1].name, /^\[Magnet\]/);
  assert.equal(result[1].infoHash, 'hash');
});

test('streams without a file index preserve automatic RD file selection', () => {
  const stream = { infoHash: 'hash', fileIdx: null, seeders: 1, name: 'Jackett', title: 'Pack' };
  const result = decorateStreamsForRealDebrid([stream], {
    token: 'token',
    baseUrl: 'http://addon',
    availabilityCache: new RealDebridAvailabilityCache(),
  });

  assert.match(result[0].url, /\/realdebrid\/play\/hash\/-1\/Pack$/);
});

test('resolver unrestricts downloaded target file and learns availability', async () => {
  const calls = [];
  const api = {
    findTorrentByHash: async () => null,
    addMagnet: async () => { calls.push('add'); return { id: 'torrent-1' }; },
    getTorrentInfo: async () => ({
      id: 'torrent-1', hash: 'hash', status: 'waiting_files_selection', links: [],
      files: [{ id: 1, path: '/video.mkv', bytes: 100, selected: 0 }],
    }),
    selectFiles: async (id, files) => { calls.push(`select:${id}:${files}`); },
    waitForTorrent: async () => ({
      id: 'torrent-1', hash: 'hash', status: 'downloaded', links: ['restricted'],
      files: [{ id: 1, path: '/video.mkv', bytes: 100, selected: 1 }],
    }),
    unrestrictLink: async link => { calls.push(`unrestrict:${link}`); return { download: 'https://rd/video.mkv' }; },
  };
  const cache = new RealDebridAvailabilityCache();

  const result = await resolveRealDebridStream({
    api, infoHash: 'hash', fileIndex: 0, availabilityCache: cache, waitForDownload: true,
  });

  assert.deepEqual(calls, ['add', 'select:torrent-1:1', 'unrestrict:restricted']);
  assert.deepEqual(result, { status: 'ready', url: 'https://rd/video.mkv' });
  assert.equal(cache.has('hash', 0), true);
});

test('resolver starts an uncached download and returns downloading without waiting', async () => {
  const api = {
    findTorrentByHash: async () => null,
    addMagnet: async () => ({ id: 'torrent-1' }),
    getTorrentInfo: async () => ({
      id: 'torrent-1', hash: 'hash', status: 'waiting_files_selection', links: [],
      files: [{ id: 1, path: '/video.mkv', bytes: 100, selected: 0 }],
    }),
    selectFiles: async () => {},
  };

  const result = await resolveRealDebridStream({
    api, infoHash: 'hash', fileIndex: 0,
    availabilityCache: new RealDebridAvailabilityCache(), waitForDownload: false,
  });

  assert.deepEqual(result, { status: 'downloading' });
});

test('RealDebridClient sends bearer-authenticated form requests', async () => {
  const requests = [];
  const http = async request => {
    requests.push(request);
    return { status: 201, data: { id: 'torrent-1' } };
  };
  const client = new RealDebridClient('secret', { http });

  const result = await client.addMagnet('magnet:?xt=urn:btih:abc');

  assert.equal(result.id, 'torrent-1');
  assert.equal(requests[0].headers.Authorization, 'Bearer secret');
  assert.equal(requests[0].data.toString(), 'magnet=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc');
});
