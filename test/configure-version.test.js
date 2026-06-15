const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const axios = require('axios');

const version = require('../package.json').version;

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      await axios.get(url, { timeout: 2000 });
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test('configure page displays the package version', { timeout: 30000 }, async (t) => {
  const port = '7013';
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: port, JACKETT_APIKEYS: '' },
    stdio: 'ignore',
  });

  t.after(() => {
    if (!child.killed) {
      child.kill();
    }
  });

  await waitForServer(`http://127.0.0.1:${port}/manifest.json`);
  const response = await axios.get(`http://127.0.0.1:${port}/configure`);

  assert.match(response.data, new RegExp(`Version\\s+${version.replace(/\./g, '\\.')}`));
});
