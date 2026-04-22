const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const axios = require('axios');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(line => line && !line.trim().startsWith('#') && line.includes('='))
      .map(line => {
        const [key, ...rest] = line.split('=');
        return [key.trim(), rest.join('=').trim()];
      })
  );
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      await axios.get(url, { timeout: 2000 });
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

test('live addon excludes english provider-language results when only ru/he are allowed', { timeout: 60000 }, async (t) => {
  const envFromFile = loadEnvFile(path.join(__dirname, '..', '.env'));
  const requiredKeys = ['JACKETT_HOSTS', 'JACKETT_APIKEYS'];
  if (!requiredKeys.every(key => envFromFile[key] || process.env[key])) {
    t.skip('Missing Jackett connection details for live language-filter test');
    return;
  }

  const port = '7011';
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      ...envFromFile,
      PORT: port,
      ALLOWED_LANGUAGES: 'ru,he',
      RESPONSE_TIMEOUT: envFromFile.RESPONSE_TIMEOUT || '20000',
      JACKETT_RTIMEOUT: envFromFile.JACKETT_RTIMEOUT || '20000',
    },
    stdio: 'ignore',
  });

  t.after(() => {
    if (!child.killed) {
      child.kill();
    }
  });

  await waitForServer(`http://127.0.0.1:${port}/manifest.json`);

  const response = await axios.get(`http://127.0.0.1:${port}/stream/movie/tt0133093.json`, {
    headers: { 'no-cache': '1' },
    timeout: 30000,
  });

  const streams = response.data.streams || [];
  assert.ok(streams.length > 0, 'expected at least one live stream result');
  assert.equal(
    streams.some(stream => Array.isArray(stream.providerLanguages) && stream.providerLanguages.includes('en')),
    false,
    'expected english provider-language streams to be filtered out'
  );
  assert.equal(
    streams.some(stream => /Src Lang EN/.test(stream.name || '') || /Src Lang EN/.test(stream.title || '')),
    false,
    'expected english source-language labels to be absent when en is disabled'
  );
});
