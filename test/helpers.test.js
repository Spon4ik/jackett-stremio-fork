const test = require('node:test');
const assert = require('node:assert/strict');

const helper = require('../src/helpers');

test('passesMinimumResolution accepts releases at or above the configured threshold', () => {
  assert.equal(helper.passesMinimumResolution('Movie.2024.1080p.WEB-DL', '720p'), true);
  assert.equal(helper.passesMinimumResolution('Movie.2024.720p.WEB-DL', '720p'), true);
  assert.equal(helper.passesMinimumResolution('Movie.2024.480p.WEB-DL', '720p'), false);
});

test('passesMinimumResolution rejects releases with no detectable resolution when configured', () => {
  assert.equal(helper.passesMinimumResolution('Movie.2024.WEB-DL', '720p'), false);
});

test('matchesAllowedLanguages supports short codes and full language names', () => {
  assert.equal(helper.matchesAllowedLanguages('Movie.2024.RUSSIAN.1080p', ['ru']), true);
  assert.equal(helper.matchesAllowedLanguages('Movie.2024.HEBREW.1080p', ['hebrew']), true);
  assert.equal(helper.matchesAllowedLanguages('Movie.2024.ENGLISH.1080p', ['english']), true);
  assert.equal(helper.matchesAllowedLanguages('Movie.2024.FRENCH.1080p', ['ru', 'he']), false);
});

test('passesLanguageFilter rejects provider languages outside the allowed list', () => {
  assert.equal(helper.passesLanguageFilter('Movie.2024.1080p', ['ru', 'he'], ['en-US']), false);
  assert.equal(helper.passesLanguageFilter('Movie.2024.1080p', ['ru', 'he'], ['he-IL']), true);
});

test('passesLanguageFilter falls back to explicit and detected languages when provider language is absent', () => {
  assert.equal(helper.passesLanguageFilter('Movie.2024.1080p', ['ru', 'he'], [], ['ru']), true);
  assert.equal(helper.passesLanguageFilter('Movie.2024.ENGLISH.1080p', ['ru', 'he'], [], []), false);
  assert.equal(helper.passesLanguageFilter('Movie.2024.1080p', ['ru', 'he'], [], []), true);
});

test('normalizeLanguageValue supports locale-style Jackett language codes', () => {
  assert.equal(helper.normalizeLanguageValue('ru-RU'), 'ru');
  assert.equal(helper.normalizeLanguageValue('he-IL'), 'he');
  assert.equal(helper.normalizeLanguageValue('en-US'), 'en');
});

test('containsRejectedKeyword matches case-insensitive title substrings', () => {
  assert.equal(helper.containsRejectedKeyword('Movie.2024.HDTS.1080p', ['ts']), true);
  assert.equal(helper.containsRejectedKeyword('Movie.2024.WEB-DL.1080p', ['cam', 'telecine']), false);
});

test('compareStreams prioritizes preferred language before later sort fields', () => {
  const runtimeConfig = {
    allowedLanguages: ['ru', 'he', 'en'],
    sortOrder: ['hdr', 'resolution', 'bitrate', 'size', 'peers'],
  };

  const russianStream = {
    languageRank: 0,
    hdr: 0,
    resolution: 720,
    bitrate: 0,
    size: 1,
    peers: 5,
    seeders: 10,
    jackettDate: 1,
  };

  const englishHdrStream = {
    languageRank: 2,
    hdr: 1,
    resolution: 2160,
    bitrate: 10_000,
    size: 10,
    peers: 50,
    seeders: 30,
    jackettDate: 2,
  };

  assert.equal(helper.compareStreams(russianStream, englishHdrStream, runtimeConfig) < 0, true);
});

test('compareStreams prioritizes explicit language tags over tagless results', () => {
  const runtimeConfig = {
    allowedLanguages: ['ru', 'he', 'en'],
    sortOrder: ['resolution', 'size', 'peers'],
  };

  const taggedStream = {
    hasLanguageTags: 1,
    languageRank: 2,
    resolution: 720,
    size: 500,
    peers: 10,
    seeders: 10,
    jackettDate: 1,
  };

  const untaggedStream = {
    hasLanguageTags: 0,
    languageRank: Number.MAX_SAFE_INTEGER,
    resolution: 2160,
    size: 5000,
    peers: 100,
    seeders: 100,
    jackettDate: 2,
  };

  assert.equal(helper.compareStreams(taggedStream, untaggedStream, runtimeConfig) < 0, true);
});

test('languagePreferenceIndex falls back to detected title language ordering', () => {
  assert.equal(helper.languagePreferenceIndex('Show.S01E01.RUSSIAN.1080p', ['ru', 'he', 'en']), 0);
  assert.equal(helper.languagePreferenceIndex('Show.S01E01.HEBREW.1080p', ['ru', 'he', 'en']), 1);
  assert.equal(helper.languagePreferenceIndex('Show.S01E01.ENGLISH.1080p', ['ru', 'he', 'en']), 2);
});

test('languagePriorityCandidates prefer provider language before explicit and detected values', () => {
  assert.deepEqual(
    helper.languagePriorityCandidates(['he-IL'], ['en'], ['ru']),
    ['he', 'en', 'ru']
  );
});
