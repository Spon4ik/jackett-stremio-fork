const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config');

test('configured RD token overrides environment token and P2P fallback is parsed', () => {
  const encoded = config.encodeUserConfig({
    realDebridApiKey: 'configured-token',
    includeP2pFallback: true,
  });
  const userConfig = config.getUserConfigFromRequest(encoded);
  const runtime = config.getRuntimeConfig(userConfig);

  assert.equal(runtime.realDebridApiKey, 'configured-token');
  assert.equal(runtime.includeP2pFallback, true);
});

test('environment RD token is available at runtime without requiring user config', () => {
  assert.equal(typeof config.getRuntimeConfig().realDebridApiKey, 'string');
});
