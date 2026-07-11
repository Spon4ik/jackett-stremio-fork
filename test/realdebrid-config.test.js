const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config');

test('configured RD token overrides environment token', () => {
  const encoded = config.encodeUserConfig({
    realDebridApiKey: 'configured-token',
  });
  const userConfig = config.getUserConfigFromRequest(encoded);
  const runtime = config.getRuntimeConfig(userConfig);

  assert.equal(runtime.realDebridApiKey, 'configured-token');
});

test('environment RD token is available at runtime without requiring user config', () => {
  assert.equal(typeof config.getRuntimeConfig().realDebridApiKey, 'string');
});
