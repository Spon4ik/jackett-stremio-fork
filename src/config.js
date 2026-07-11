const { URL } = require('url');

const DEFAULT_SORT_ORDER = ['hdr', 'resolution', 'bitrate', 'size', 'peers'];
const SUPPORTED_LANGUAGES = ['ru', 'he', 'en'];
const SUPPORTED_RESOLUTIONS = ['480p', '576p', '720p', '1080p', '1440p', '2160p', '4k'];

function parseCsv(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseOptionalInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function uniqueOrdered(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function parseLanguageOrder(value, fallback = []) {
  const parsed = uniqueOrdered(parseCsv(value))
    .map(language => language === 'russian' ? 'ru' : language === 'hebrew' ? 'he' : language === 'english' ? 'en' : language)
    .filter(language => SUPPORTED_LANGUAGES.includes(language));

  return parsed.length > 0 ? parsed : fallback;
}

function parseSortOrder(value, fallback = DEFAULT_SORT_ORDER) {
  const supported = ['hdr', 'resolution', 'bitrate', 'size', 'peers', 'seeders'];
  const parsed = uniqueOrdered(parseCsv(value)).filter(sortField => supported.includes(sortField));
  return parsed.length > 0 ? parsed : fallback.slice();
}

function normalizeMinimumResolution(value, fallback = '') {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return SUPPORTED_RESOLUTIONS.includes(normalized) ? normalized : fallback;
}

function normalizeMaximumSize(value, fallback = '') {
  const normalized = (value || '').trim().toUpperCase();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}

const defaultConfig = {

  "addonName": process.env.ADDON_NAME || "Jackett",

  "dontParseTorrentFiles": parseBoolean(process.env.DONT_PARSE_TORRENT_FILES),

  "interval": parseInt(process.env.INTERVAL) || 500,

  "addBestTrackers": parseBoolean(process.env.ADD_BEST_TRACKERS),

  "addRussianTrackers": parseBoolean(process.env.ADD_RUSSIAN_TRACKERS),

  "addExtraTrackers": parseBoolean(process.env.ADD_EXTRA_TRACKERS),

  "removeBlacklistTrackers": parseBoolean(process.env.REMOVE_BLACKLIST_TRACKERS),

  "debug": parseBoolean(process.env.DEBUG),

  "searchByType": parseBoolean(process.env.SEARCH_BY_TYPE),

  "dontSearchByYear": parseBoolean(process.env.DONT_SEARCH_BY_YEAR),

  "responseTimeout": parseInt(process.env.RESPONSE_TIMEOUT) || 8000,

  "addonPort": parseInt(process.env.PORT) || 7000,

  "minimumSeeds": parseOptionalInt(process.env.MIN_SEED, 0),

  "maximumResults": parseInt(process.env.MAX_RESULTS) || 5,

  "maximumSize": normalizeMaximumSize(process.env.MAX_SIZE, ''),

  "allowedLanguages": parseLanguageOrder(process.env.ALLOWED_LANGUAGES),

  "minimumResolution": normalizeMinimumResolution(process.env.MIN_RESOLUTION),

  "rejectKeywords": parseCsv(process.env.REJECT_KEYWORDS),

  "sortOrder": parseSortOrder(process.env.SORT_ORDER),

  "ignoreTitles": process.env.IGNORE_TITLES || "\\b(Telecine|CAMRip)\\b|\\b(?:HD-?)?T(?:ELE)?S(?:YNC)?\\b|\\b(?:HD-?)?CAM\\b|\\b(?:HQ-?)?CAM\\b",

  "downloadTorrentQueue": parseInt(process.env.DOWNLOAD_TORRENT_QUEUE) || 10,

  "cacheIndexersTime": parseInt(process.env.CACHE_INDEXERS_TIME) || 30,

  "cacheResultsTime": parseInt(process.env.CACHE_RESULTS_TIME) || 180,

  "tmdbAPIKey": process.env.TMDB_APIKEY || "",

  "realDebridApiKey": process.env.REAL_DEBRID_API_KEY || "",

  "updateTrackersInterval": parseInt(process.env.UPDATE_TRACKERS_INTERVAL) || 1440,

  "jackett": {

    "hosts": process.env.JACKETT_HOSTS || process.env.JACKETT_HOST || "http://127.0.0.1:9117/", // JACKETT_HOST is for backwards compatibility

    "apiKeys": process.env.JACKETT_APIKEYS || process.env.JACKETT_APIKEY || "",  // JACKETT_APIKEY is for backwards compatibility

    "readTimeout": parseInt(process.env.JACKETT_RTIMEOUT) || 8000,

    "indexerFilters": process.env.INDEXER_FILTERS || "status:healthy,test:passed" // instead of `all`.
  },

  "additionalSources": process.env.ADDITIONAL_SOURCES || ""

}

function isIPv4(value) {
  // Regular expression to validate IPv4 addresses
  const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  return ipv4Regex.test(value);
}

function isFQDN(value) {
  // Regular expression to validate FQDNs
  const fqdnRegex = /^([a-zA-Z0-9.-]+\.)+[a-zA-Z]{2,}$/;
  return fqdnRegex.test(value);
}

function correctAndValidateURL(input) {
  const urls = input.split(',');
  const finalUrls = [];
  urls.forEach((element) => {
    try {
      const parsedURL = new URL(element);

      if (parsedURL.protocol === 'http:' && (isIPv4(parsedURL.hostname) || isFQDN(parsedURL.hostname))) {
        finalUrls.push(parsedURL.href); // Return the original URL if it's valid
        return;
      }

      parsedURL.protocol = 'http:';

      if (!parsedURL.pathname) {
        parsedURL.pathname = '/';
      }

      const correctedURL = parsedURL.href;

      finalUrls.push(correctedURL);
    } catch (error) {
      console.error(`URL ${element} doesn't seem like a valid URL. Using it anyway.`)
      finalUrls.push(element);
      return;
    }
  });
  return finalUrls.join(',')
}


function toBytes(humanSize) {
  if (humanSize === undefined || humanSize === null || humanSize === '') {
    return 0;
  }

  const sizeString = (typeof humanSize === 'string') ? humanSize : humanSize.toString();
  const sizeRegex = /^(\d+(\.\d+)?)\s*([kKmMgGtT]?[bB]?)$/;
  const match = sizeString.match(sizeRegex);

  if (!match) {
    console.error('Invalid maximumSize format set. Supported formats: B/KB/MB/GB/TB. Example : 5GB');
    return 0;
  }

  const numericPart = parseFloat(match[1]);
  const unit = match[3].toUpperCase();

  const units = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
  };

  if (!Object.prototype.hasOwnProperty.call(units, unit)) {
    console.error('Invalid maximumSize format set. Supported formats: B/KB/MB/GB/TB. Example : 5GB');
    return 0;
  }

  return parseInt(numericPart * units[unit]);
}

function loadSource() {
  if (!defaultConfig.additionalSources) {
    return;
  }
  const parts = defaultConfig.additionalSources.split(',');
  const sourceList = [];
  for (const part of parts) {
    const decodedValue = Buffer.from(part, 'base64').toString('utf-8');
    sourceList.push(decodedValue);
  }
  defaultConfig.additionalSources = sourceList;
}

function decodeUserConfig(encodedConfig) {
  if (!encodedConfig) {
    return {};
  }

  try {
    const normalized = encodedConfig.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(normalized + padding, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Could not decode user config:', error.message);
    return {};
  }
}

function encodeUserConfig(userConfig) {
  return Buffer.from(JSON.stringify(userConfig))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getRuntimeConfig(overrides = {}) {
  const hasAllowedLanguagesOverride = Object.prototype.hasOwnProperty.call(overrides, 'allowedLanguages');
  const hasMinimumSeedsOverride = Object.prototype.hasOwnProperty.call(overrides, 'minimumSeeds');
  const hasMaximumSizeOverride = Object.prototype.hasOwnProperty.call(overrides, 'maximumSize');
  const hasMinimumResolutionOverride = Object.prototype.hasOwnProperty.call(overrides, 'minimumResolution');
  const hasSortOrderOverride = Object.prototype.hasOwnProperty.call(overrides, 'sortOrder');
  const hasRealDebridApiKeyOverride = Object.prototype.hasOwnProperty.call(overrides, 'realDebridApiKey');

  const allowedLanguages = hasAllowedLanguagesOverride && Array.isArray(overrides.allowedLanguages)
    ? parseLanguageOrder(overrides.allowedLanguages.join(','), defaultConfig.allowedLanguages)
    : defaultConfig.allowedLanguages.slice();

  return {
    ...defaultConfig,
    allowedLanguages,
    minimumSeeds: hasMinimumSeedsOverride
      ? parseOptionalInt(overrides.minimumSeeds, 0)
      : defaultConfig.minimumSeeds,
    maximumSizeInput: hasMaximumSizeOverride
      ? normalizeMaximumSize(overrides.maximumSize, '')
      : defaultConfig.maximumSizeInput,
    maximumSize: hasMaximumSizeOverride
      ? toBytes(normalizeMaximumSize(overrides.maximumSize, ''))
      : defaultConfig.maximumSize,
    minimumResolution: hasMinimumResolutionOverride
      ? normalizeMinimumResolution(overrides.minimumResolution, '')
      : defaultConfig.minimumResolution,
    sortOrder: hasSortOrderOverride
      ? parseSortOrder(Array.isArray(overrides.sortOrder) ? overrides.sortOrder.join(',') : overrides.sortOrder, defaultConfig.sortOrder)
      : defaultConfig.sortOrder,
    realDebridApiKey: hasRealDebridApiKeyOverride
      ? String(overrides.realDebridApiKey || '').trim()
      : defaultConfig.realDebridApiKey,
  };
}

function getUserConfigFromRequest(encodedConfig) {
  const decodedConfig = decodeUserConfig(encodedConfig);
  return {
    ...(Object.prototype.hasOwnProperty.call(decodedConfig, 'allowedLanguages')
      ? { allowedLanguages: parseLanguageOrder(Array.isArray(decodedConfig.allowedLanguages) ? decodedConfig.allowedLanguages.join(',') : '', defaultConfig.allowedLanguages) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(decodedConfig, 'minimumSeeds')
      ? { minimumSeeds: parseOptionalInt(decodedConfig.minimumSeeds, 0) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(decodedConfig, 'maximumSize')
      ? { maximumSize: normalizeMaximumSize(decodedConfig.maximumSize, '') }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(decodedConfig, 'minimumResolution')
      ? { minimumResolution: normalizeMinimumResolution(decodedConfig.minimumResolution, '') }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(decodedConfig, 'sortOrder')
      ? { sortOrder: parseSortOrder(Array.isArray(decodedConfig.sortOrder) ? decodedConfig.sortOrder.join(',') : '', defaultConfig.sortOrder) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(decodedConfig, 'realDebridApiKey')
      ? { realDebridApiKey: String(decodedConfig.realDebridApiKey || '').trim() }
      : {}),
  };
}

defaultConfig.jackett.indexerFilters = encodeURIComponent(defaultConfig.jackett.indexerFilters);
defaultConfig.maximumSizeInput = defaultConfig.maximumSize;
defaultConfig.maximumSize = toBytes(defaultConfig.maximumSize);
defaultConfig.jackett.hosts = correctAndValidateURL(defaultConfig.jackett.hosts);
console.log(defaultConfig)
loadSource();
defaultConfig.defaultSortOrder = DEFAULT_SORT_ORDER.slice();
defaultConfig.supportedLanguages = SUPPORTED_LANGUAGES.slice();
defaultConfig.supportedResolutions = SUPPORTED_RESOLUTIONS.slice();
defaultConfig.getRuntimeConfig = getRuntimeConfig;
defaultConfig.getUserConfigFromRequest = getUserConfigFromRequest;
defaultConfig.encodeUserConfig = encodeUserConfig;
module.exports = defaultConfig;
