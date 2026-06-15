const parseTorrent = require('parse-torrent')
const async = require('async');
const axios = require('axios');
const getPort = require('get-port');
const express = require('express');
const { AbortController } = require('abort-controller');
const addon = express();
const jackettApi = require('./jackett');
const helper = require('./helpers');
const config = require('./config');
const { getTrackers } = require('./trackers');
const { configureConnectionPooling } = require('./requests');
const { setCacheVariable, getCacheVariable } = require('./cache');
const {
    RealDebridClient,
    RealDebridAvailabilityCache,
    decorateStreamsForRealDebrid,
    resolveRealDebridStream,
} = require('./realdebrid');
const version = require('../package.json').version;

global.TRACKERS = [];
global.BLACKLIST_TRACKERS = [];
const realDebridAvailability = new RealDebridAvailabilityCache();
const RD_STATUS_VIDEO_BASE_URL = process.env.RD_STATUS_VIDEO_BASE_URL || 'https://torrentio.strem.fun/videos';

const respond = (res, data) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
};

function getBaseUrl(req, encodedConfig = '') {
    const prefix = encodedConfig ? `/${encodedConfig}` : '';
    return `${req.protocol}://${req.get('host')}${prefix}`;
}

function buildConfiguredAddonName(runtimeConfig) {
    const parts = [];
    if (runtimeConfig.allowedLanguages && runtimeConfig.allowedLanguages.length > 0) {
        parts.push(`lang:${runtimeConfig.allowedLanguages.join('>')}`);
    }

    if (runtimeConfig.minimumResolution) {
        parts.push(`min:${runtimeConfig.minimumResolution}`);
    }

    if (runtimeConfig.minimumSeeds > 0) {
        parts.push(`seeds:${runtimeConfig.minimumSeeds}`);
    }

    if (runtimeConfig.maximumSize > 0 && runtimeConfig.maximumSizeInput) {
        parts.push(`max:${runtimeConfig.maximumSizeInput}`);
    }

    if (runtimeConfig.realDebridApiKey) {
        parts.push(runtimeConfig.includeP2pFallback ? 'RD+P2P' : 'RD');
    }

    return parts.length > 0
        ? `${runtimeConfig.addonName} [${parts.join(' | ')}]`
        : runtimeConfig.addonName;
}

function buildManifest(runtimeConfig) {
    return {
        "id": "org.stremio.jackett",
        "version": version,

        "name": buildConfiguredAddonName(runtimeConfig),
        "description": "Stremio Add-on to get torrent results from Jackett.",

        "icon": "https://svgur.com/i/12Ss.svg",
        "logo": "https://uxwing.com/wp-content/themes/uxwing/download/clothes-and-accessories/hoodie-jacket-icon.png",

        "resources": [
            {
                "name": "stream",
                "types": [
                    "movie",
                    "series"
                ],
                "idPrefixes": [
                    "tt",
                    "tmdb"
                ]
            }
        ],

        "behaviorHints": {
            "p2p": true,
            "configurable": true,
            "adult": false,
            "configurationRequired": false
        },

        "types": ["movie", "series"],
        "idPrefixes": ["tt", "tmdb"],

        "catalogs": []
    };
}

function renderConfigurePage(req, runtimeConfig, encodedConfig = '') {
    const manifestUrl = `${getBaseUrl(req, encodedConfig)}/manifest.json`;
    const selectedLanguages = runtimeConfig.allowedLanguages.length > 0 ? runtimeConfig.allowedLanguages : config.supportedLanguages;
    const selectedSortOrder = helper.normalizeSortOrder(runtimeConfig.sortOrder);
    const summary = `Language priority: ${selectedLanguages.join(' > ') || 'none'} | Min resolution: ${runtimeConfig.minimumResolution || 'any'} | Min seeds: ${runtimeConfig.minimumSeeds > 0 ? runtimeConfig.minimumSeeds : 'ignored'} | Max size: ${runtimeConfig.maximumSize > 0 && runtimeConfig.maximumSizeInput ? runtimeConfig.maximumSizeInput : 'ignored'} | Sort: ${selectedSortOrder.join(' > ')}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${config.addonName} Setup</title>
    <style>
        :root { color-scheme: dark; --bg: #111827; --panel: #1f2937; --muted: #9ca3af; --text: #f9fafb; --accent: #f59e0b; --border: #374151; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: "Segoe UI", sans-serif; background: radial-gradient(circle at top, #1f2937, #0f172a 65%); color: var(--text); }
        main { max-width: 860px; margin: 0 auto; padding: 32px 20px 48px; }
        .panel { background: rgba(17, 24, 39, 0.92); border: 1px solid var(--border); border-radius: 18px; padding: 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35); }
        h1, h2 { margin: 0 0 12px; }
        p { color: var(--muted); line-height: 1.5; }
        .grid { display: grid; gap: 18px; }
        .triple { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        label { display: block; font-weight: 600; margin-bottom: 8px; }
        select, input, button, textarea { width: 100%; border-radius: 12px; border: 1px solid var(--border); background: #111827; color: var(--text); padding: 12px 14px; }
        button { background: linear-gradient(135deg, #f59e0b, #ea580c); color: white; font-weight: 700; cursor: pointer; border: none; }
        .note { font-size: 14px; color: var(--muted); }
        .stack { display: grid; gap: 10px; }
        code { color: #fde68a; word-break: break-all; }
        .preview { padding: 14px; background: #0b1220; border-radius: 12px; border: 1px solid #1f2937; }
    </style>
</head>
<body>
    <main>
        <div class="panel grid">
            <div>
                <h1>${config.addonName} Setup</h1>
                <div class="note">Version ${version}</div>
                <p>Choose which languages to prefer, set the minimum acceptable resolution, and define how results should be ranked after language preference is applied.</p>
            </div>
            <div class="triple">
                <div>
                    <label for="language1">Language Priority 1</label>
                    <select id="language1">
                        <option value="">Off</option>
                        <option value="ru">Russian</option>
                        <option value="he">Hebrew</option>
                        <option value="en">English</option>
                    </select>
                </div>
                <div>
                    <label for="language2">Language Priority 2</label>
                    <select id="language2">
                        <option value="">Off</option>
                        <option value="ru">Russian</option>
                        <option value="he">Hebrew</option>
                        <option value="en">English</option>
                    </select>
                </div>
                <div>
                    <label for="language3">Language Priority 3</label>
                    <select id="language3">
                        <option value="">Off</option>
                        <option value="ru">Russian</option>
                        <option value="he">Hebrew</option>
                        <option value="en">English</option>
                    </select>
                </div>
            </div>
            <div class="triple">
                <div>
                    <label for="minimumResolution">Minimum Resolution</label>
                    <select id="minimumResolution">
                        <option value="">Any</option>
                        <option value="480p">480p</option>
                        <option value="576p">576p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="1440p">1440p</option>
                        <option value="2160p">2160p</option>
                        <option value="4k">4K</option>
                    </select>
                </div>
                <div>
                    <label for="minimumSeeds">Minimum Seeds</label>
                    <input id="minimumSeeds" type="number" min="0" step="1" placeholder="Ignored">
                </div>
                <div>
                    <label for="maximumSize">Maximum Size</label>
                    <input id="maximumSize" type="text" placeholder="Ignored (e.g. 10GB)">
                </div>
            </div>
            <div class="stack">
                <h2>Sort Order</h2>
                <p class="note">Language preference is always applied first. Then the addon compares these fields from top to bottom.</p>
                <div class="triple">
                    <div>
                        <label for="sort1">Sort 1</label>
                        <select id="sort1">
                            <option value="hdr">HDR</option>
                            <option value="resolution">Resolution</option>
                            <option value="bitrate">Bitrate</option>
                            <option value="size">Size</option>
                            <option value="peers">Peers</option>
                            <option value="seeders">Seeders</option>
                        </select>
                    </div>
                    <div>
                        <label for="sort2">Sort 2</label>
                        <select id="sort2">
                            <option value="hdr">HDR</option>
                            <option value="resolution">Resolution</option>
                            <option value="bitrate">Bitrate</option>
                            <option value="size">Size</option>
                            <option value="peers">Peers</option>
                            <option value="seeders">Seeders</option>
                        </select>
                    </div>
                    <div>
                        <label for="sort3">Sort 3</label>
                        <select id="sort3">
                            <option value="hdr">HDR</option>
                            <option value="resolution">Resolution</option>
                            <option value="bitrate">Bitrate</option>
                            <option value="size">Size</option>
                            <option value="peers">Peers</option>
                            <option value="seeders">Seeders</option>
                        </select>
                    </div>
                    <div>
                        <label for="sort4">Sort 4</label>
                        <select id="sort4">
                            <option value="hdr">HDR</option>
                            <option value="resolution">Resolution</option>
                            <option value="bitrate">Bitrate</option>
                            <option value="size">Size</option>
                            <option value="peers">Peers</option>
                            <option value="seeders">Seeders</option>
                        </select>
                    </div>
                    <div>
                        <label for="sort5">Sort 5</label>
                        <select id="sort5">
                            <option value="hdr">HDR</option>
                            <option value="resolution">Resolution</option>
                            <option value="bitrate">Bitrate</option>
                            <option value="size">Size</option>
                            <option value="peers">Peers</option>
                            <option value="seeders">Seeders</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="stack">
                <h2>Real-Debrid</h2>
                <p class="note">The token may be supplied here or with REAL_DEBRID_API_KEY. URL configuration is encoded, not encrypted.</p>
                <label for="realDebridApiKey">API Token</label>
                <input id="realDebridApiKey" type="password" autocomplete="off" placeholder="Use environment token">
                <label><input id="includeP2pFallback" type="checkbox" style="width:auto;margin-right:8px;">Show labeled P2P fallback streams</label>
            </div>
            <div class="stack">
                <button id="installButton" type="button">Generate Install URL</button>
                <a id="openManifestLink" href="${manifestUrl}" style="display:block;color:#fde68a;text-decoration:none;">Open manifest URL</a>
                <div class="note" id="configSummary">${summary}</div>
                <div class="preview">
                    <div class="note">Manifest URL</div>
                    <code id="manifestUrl">${manifestUrl}</code>
                </div>
            </div>
        </div>
    </main>
    <script>
        const selectedLanguages = ${JSON.stringify(selectedLanguages)};
        const selectedSortOrder = ${JSON.stringify(selectedSortOrder)};
        const minimumResolution = ${JSON.stringify(runtimeConfig.minimumResolution || '')};
        const minimumSeeds = ${JSON.stringify(runtimeConfig.minimumSeeds > 0 ? String(runtimeConfig.minimumSeeds) : '')};
        const maximumSize = ${JSON.stringify(runtimeConfig.maximumSize > 0 && runtimeConfig.maximumSizeInput ? runtimeConfig.maximumSizeInput : '')};
        const realDebridApiKey = ${JSON.stringify(encodedConfig ? runtimeConfig.realDebridApiKey || '' : '')};
        const includeP2pFallback = ${JSON.stringify(runtimeConfig.includeP2pFallback)};

        ['language1', 'language2', 'language3'].forEach((id, index) => {
            const element = document.getElementById(id);
            element.value = selectedLanguages[index] || '';
        });

        ['sort1', 'sort2', 'sort3', 'sort4', 'sort5'].forEach((id, index) => {
            const element = document.getElementById(id);
            element.value = selectedSortOrder[index] || 'hdr';
        });

        document.getElementById('minimumResolution').value = minimumResolution;
        document.getElementById('minimumSeeds').value = minimumSeeds;
        document.getElementById('maximumSize').value = maximumSize;
        document.getElementById('realDebridApiKey').value = realDebridApiKey;
        document.getElementById('includeP2pFallback').checked = includeP2pFallback;

        function encodeConfig(config) {
            return btoa(JSON.stringify(config)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
        }

        function updateManifestUrl() {
            const allowedLanguages = ['language1', 'language2', 'language3']
                .map(id => document.getElementById(id).value)
                .filter(Boolean)
                .filter((value, index, array) => array.indexOf(value) === index);

            const sortOrder = ['sort1', 'sort2', 'sort3', 'sort4', 'sort5']
                .map(id => document.getElementById(id).value)
                .filter(Boolean)
                .filter((value, index, array) => array.indexOf(value) === index);

            const payload = {
                allowedLanguages,
                minimumResolution: document.getElementById('minimumResolution').value,
                minimumSeeds: document.getElementById('minimumSeeds').value,
                maximumSize: document.getElementById('maximumSize').value.trim(),
                sortOrder,
                realDebridApiKey: document.getElementById('realDebridApiKey').value.trim(),
                includeP2pFallback: document.getElementById('includeP2pFallback').checked
            };

            const encoded = encodeConfig(payload);
            const manifestUrl = window.location.origin + '/' + encoded + '/manifest.json';
            document.getElementById('manifestUrl').textContent = manifestUrl;
            document.getElementById('openManifestLink').href = manifestUrl;
            document.getElementById('configSummary').textContent =
                'Language priority: ' + (allowedLanguages.join(' > ') || 'none') +
                ' | Min resolution: ' + (payload.minimumResolution || 'any') +
                ' | Min seeds: ' + (payload.minimumSeeds || 'ignored') +
                ' | Max size: ' + (payload.maximumSize || 'ignored') +
                ' | Sort: ' + (sortOrder.join(' > ') || 'default');
        }

        ['language1', 'language2', 'language3', 'sort1', 'sort2', 'sort3', 'sort4', 'sort5', 'minimumResolution', 'minimumSeeds', 'maximumSize', 'realDebridApiKey', 'includeP2pFallback']
            .forEach(id => document.getElementById(id).addEventListener('change', updateManifestUrl));

        document.getElementById('installButton').addEventListener('click', updateManifestUrl);
    </script>
</body>
</html>`;
}

function sendConfigurePage(req, res, runtimeConfig, encodedConfig = '') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderConfigurePage(req, runtimeConfig, encodedConfig));
}

addon.get('/', (req, res) => {
    res.redirect('/configure');
});

addon.get('/configure', (req, res) => {
    sendConfigurePage(req, res, config.getRuntimeConfig());
});

addon.get('/:userConfig/configure', (req, res) => {
    const userConfig = config.getUserConfigFromRequest(req.params.userConfig);
    sendConfigurePage(req, res, config.getRuntimeConfig(userConfig), req.params.userConfig);
});

addon.get('/manifest.json', (req, res) => {
    console.log("Sending manifest.");
    respond(res, buildManifest(config.getRuntimeConfig()));
});

addon.get('/:userConfig/manifest.json', (req, res) => {
    const userConfig = config.getUserConfigFromRequest(req.params.userConfig);
    console.log("Sending configured manifest.");
    respond(res, buildManifest(config.getRuntimeConfig(userConfig)));
});

async function getStreamInfo(streamInfo, abortSignals) {
    let url = "";
    if (streamInfo.db === 'tt') {
        url = 'https://v3-cinemeta.strem.io/meta/' + streamInfo.type + '/' + streamInfo.Id + '.json';
    } else if (streamInfo.db == 'tmdb' && config.tmdbAPIKey) {
        const type = streamInfo.type == 'movie' ? "movie" : "tv";
        url = 'https://api.themoviedb.org/3/' + type + '/' + streamInfo.Id + '?api_key=' + config.tmdbAPIKey;
    } else {
        throw new Error(`Could not get info from Cinemata`);
    }

    config.debug && console.log("DB url", url);
    const controller = new AbortController();
    abortSignals.push(controller)
    const signal = controller.signal;

    const response = await axios({
        method: 'get',
        url: url,
        maxRedirects: 5,  // Equivalent to 'redirect: 'follow'' in fetch
        timeout: config.responseTimeout,
        signal: signal,  // Assuming 'signal' is an AbortSignal instance
        responseType: 'json'
    });

    const index = abortSignals.indexOf(controller);
    if (index !== -1) {
        abortSignals.splice(index, 1); // Remove the controller from the array
    }

    const responseBody = response.data;
    if (streamInfo.db === 'tt') {
        if (!responseBody) {
            throw new Error(`Could not get info from Cinemata: ${url} - ${response.status}`);
        }

        streamInfo.name = responseBody.meta.name;
        streamInfo.year = (responseBody.meta.year) ? responseBody.meta.year.match(/\b\d{4}\b/)[0] : (responseBody.meta.releaseInfo) ? responseBody.meta.releaseInfo.match(/\b\d{4}\b/)[0] : '';
    } else {
        if (!responseBody) {
            throw new Error(`Could not get info from tmdb: ${url} - ${response.status}`);
        }
        streamInfo.name = responseBody.name ? responseBody.name : responseBody.title;
        streamInfo.year = (responseBody.release_date) ? responseBody.release_date.match(/\b\d{4}\b/)[0] : (responseBody.last_air_date) ? responseBody.last_air_date.match(/\b\d{4}\b/)[0] : '';
    }
}

function partitionURL(list) {
    const results = list.map((item) => {
        if ('magneturl' in item && item.magneturl && item.magneturl.startsWith("magnet:")) {
            return { magnets: [item], links: [] };
        } else {
            return { magnets: [], links: [item] };
        }
    });

    return results.reduce(
        (acc, result) => ({
            magnets: acc.magnets.concat(result.magnets),
            links: acc.links.concat(result.links),
        }),
        { magnets: [], links: [] }
    );
}

function processTorrentList(torrentList, runtimeConfig) {
    if (torrentList.length === 0) {
        return [];
    }
    const duplicatesMap = new Map();

    torrentList.forEach(torrent => {
        const infoHash = torrent.infoHash;

        if (torrent.seeders < runtimeConfig.minimumSeeds) {
            return;
        }

        // Check if infoHash is already in the map
        if (duplicatesMap.has(infoHash)) {
            // If duplicate, update if the current torrent has higher seeders
            const existingTorrent = duplicatesMap.get(infoHash);
            if (helper.compareStreams(torrent, existingTorrent, runtimeConfig) < 0) {
                duplicatesMap.set(infoHash, {
                    ...torrent,
                    sources: helper.unique([...existingTorrent.sources, ...torrent.sources]),
                });
            }
        } else {
            duplicatesMap.set(infoHash, torrent);
        }
    });

    // Filter out torrents with the same infoHash
    const uniqueTorrents = [...duplicatesMap.values()];

    uniqueTorrents.sort((a, b) => helper.compareStreams(a, b, runtimeConfig));
    // Move the sources starting with 'dht' to the end of the list
    uniqueTorrents.forEach(torrent => {
        const dhtSources = torrent.sources.filter(source => source.startsWith('dht'));
        const nonDhtSources = torrent.sources.filter(source => !source.startsWith('dht'));
        torrent.sources = [...nonDhtSources, ...dhtSources];
    });
    const slicedTorrents = uniqueTorrents.slice(0, runtimeConfig.maximumResults);

    return slicedTorrents;
}

function decorateStreamRankingFields(stream, runtimeConfig) {
    const explicitLanguages = helper.normalizeLanguageList(stream.languages || []);
    const providerLanguages = helper.normalizeLanguageList(stream.providerLanguages || []);
    const sourceTitle = stream.releaseTitle || stream.title || '';
    const detectedLanguages = helper.normalizeLanguageList([helper.findLanguage(sourceTitle, runtimeConfig.allowedLanguages)]);
    const priorityLanguages = helper.languagePriorityCandidates(providerLanguages, explicitLanguages, detectedLanguages);

    stream.languages = explicitLanguages;
    stream.providerLanguages = providerLanguages;
    stream.subtitleLanguages = helper.normalizeLanguageList(stream.subtitleLanguages || []);
    stream.tags = helper.unique(stream.tags || []);
    stream.hasLanguageTags = (explicitLanguages.length > 0 || providerLanguages.length > 0) ? 1 : 0;
    stream.detectedLanguages = detectedLanguages;
    stream.languageRank = helper.languagePreferenceIndex(sourceTitle, runtimeConfig.allowedLanguages, priorityLanguages);
    stream.hdr = stream.hdr ?? (helper.hasHdr(stream.title || '') ? 1 : 0);
    stream.resolution = stream.resolution ?? helper.resolutionRank(stream.title || '');
    stream.bitrate = stream.bitrate ?? helper.findBitrate(stream.title || '');
    stream.peers = stream.peers || 0;
    stream.size = stream.size || 0;
    stream.seeders = stream.seeders || 0;
    stream.jackettDate = stream.jackettDate || 0;
    return stream;
}

function buildStreamName(runtimeConfig, quality, languages, providerLanguages, subtitleLanguages, tags, detectedLanguages = []) {
    const lines = [runtimeConfig.addonName];
    if (quality) {
        lines.push(quality);
    }

    if (languages.length > 0) {
        lines.push(`Lang ${languages.join(',')}`);
    } else if (providerLanguages.length > 0) {
        lines.push(`Src Lang ${providerLanguages.join(',')}`);
    } else if (detectedLanguages.length > 0) {
        lines.push(`Lang? ${detectedLanguages.join(',')}`);
    }
    if (subtitleLanguages.length > 0) {
        lines.push(`Subs ${subtitleLanguages.join(',')}`);
    }
    if (tags.length > 0) {
        lines.push(`Tags ${tags.join(',')}`);
    }

    return lines.join('\n');
}

function buildStreamTitle(streamInfo, stream, releaseName) {
    const baseTitle = streamInfo.name + ' ' + (streamInfo.season && streamInfo.episode ? ` ${helper.episodeTag(streamInfo.season, streamInfo.episode)}` : streamInfo.year);
    const detailLines = [];

    if (releaseName) {
        detailLines.push(`Release: ${releaseName}`);
    }

    if ((stream.languages || []).length > 0) {
        detailLines.push(`Lang ${helper.displayLanguageList(stream.languages).join(',')}`);
    } else if ((stream.providerLanguages || []).length > 0) {
        detailLines.push(`Src Lang ${helper.displayLanguageList(stream.providerLanguages).join(',')}`);
    } else if ((stream.detectedLanguages || []).length > 0) {
        detailLines.push(`Lang? ${helper.displayLanguageList(stream.detectedLanguages).join(',')}`);
    } else {
        detailLines.push('No Lang Tag');
    }

    if (stream.hdr) {
        detailLines.push('HDR');
    }

    if (stream.resolution) {
        detailLines.push(`${stream.resolution}p`);
    }

    if (stream.bitrate) {
        detailLines.push(`${stream.bitrate} kbps`);
    }

    detailLines.push(`Peers ${stream.peers || 0}`);
    detailLines.push(`Seeds ${stream.seeders || 0}`);
    detailLines.push(`Size ${helper.toHomanReadable(stream.displaySize || stream.size || 0)}`);
    detailLines.push(`From ${stream.from}`);

    return `${baseTitle}\r\n\r\n${detailLines.join('\r\n')}`;
}

function streamFromParsed(tor, parsedTorrent, streamInfo, runtimeConfig, cb) {
    const stream = {};
    const infoHash = parsedTorrent.infoHash.toLowerCase();

    if (parsedTorrent && parsedTorrent.files) {
        if (parsedTorrent.files.length == 1) {
            stream.fileIdx = 0;
        } else {
            let regEx = null;
            if (streamInfo.type === 'movie') {
                regEx = new RegExp(`${streamInfo.name.split(' ').join('.*')}.*${!runtimeConfig.dontSearchByYear && streamInfo.year ? streamInfo.year : ''}.*`, 'i');
            } else {
                regEx = new RegExp(`${streamInfo.name.split(' ').join('.*')}.*${helper.episodeTag(streamInfo.season, streamInfo.episode)}.*`, 'i');
            }
            const matchingItems = parsedTorrent.files.filter(item => regEx.test(item.name));
            if (matchingItems.length > 0) {
                const indexInFiles = parsedTorrent.files.indexOf(matchingItems.reduce((maxItem, currentItem) => {
                    return currentItem.length > maxItem.length ? currentItem : maxItem;
                }, matchingItems[0]));

                stream.fileIdx = indexInFiles;
                config.debug && console.log("Found matching fileIdx for " + streamInfo.name + " is " + stream.fileIdx, parsedTorrent.files);
            } else {
                config.debug && console.log("No matching items found for torrent ", streamInfo.name, matchingItems, parsedTorrent.files);
            }
        }
    } else {
        stream.fileIdx = null;
    }

    if (stream.fileIdx !== null && parsedTorrent && parsedTorrent.files && parsedTorrent.files[stream.fileIdx]) {
        stream.displaySize = parsedTorrent.files[stream.fileIdx].length || 0;
    }

    const quality = helper.findQuality(tor.extraTag);
    let trackers = [];
    if (global.TRACKERS) {
        trackers = helper.unique([].concat(parsedTorrent.announce).concat(global.TRACKERS));
        config.debug && ((trackers.length - parsedTorrent.announce.length) > 0) && console.log("Added " + (trackers.length - parsedTorrent.announce.length) + " extra trackers.");
    }

    if (global.BLACKLIST_TRACKERS) {
        const filteredTrackers = trackers.filter(item => !global.BLACKLIST_TRACKERS.includes(item));
        if ((trackers.length - filteredTrackers.length) != 0) {
            config.debug && console.log("Removed : " + (trackers.length - filteredTrackers.length) + " blacklisted trackers.");
            trackers = filteredTrackers;
        }
    }

    stream.languages = tor.languages || [];
    stream.providerLanguages = tor.providerLanguages || [];
    stream.subtitleLanguages = tor.subtitleLanguages || [];
    stream.tags = tor.tags || [];
    stream.name = buildStreamName(
        runtimeConfig,
        quality,
        helper.displayLanguageList(stream.languages),
        helper.displayLanguageList(stream.providerLanguages),
        helper.displayLanguageList(stream.subtitleLanguages),
        stream.tags,
        helper.displayLanguageList(stream.detectedLanguages || [])
    );
    stream.tag = quality
    stream.type = streamInfo.type;
    stream.infoHash = infoHash;
    stream.releaseTitle = tor.title || '';
    stream.from = tor.from;
    stream.sources = trackers.map(x => { return "tracker:" + x; }).concat(["dht:" + infoHash]);
    stream.seeders = tor.seeders;
    stream.peers = tor.peers || 0;
    stream.size = tor.size || 0;
    stream.displaySize = stream.displaySize || stream.size || 0;
    stream.hdr = helper.hasHdr(tor.title) ? 1 : 0;
    stream.resolution = helper.resolutionRank(tor.title);
    stream.bitrate = helper.findBitrate(tor.title);
    stream.jackettDate = tor.jackettDate || 0;
    stream.behaviorHints = {
        bingieGroup: "Jackett|" + infoHash,
    }
    const rankedStream = decorateStreamRankingFields(stream, runtimeConfig);
    rankedStream.name = buildStreamName(
        runtimeConfig,
        quality,
        helper.displayLanguageList(rankedStream.languages),
        helper.displayLanguageList(rankedStream.providerLanguages),
        helper.displayLanguageList(rankedStream.subtitleLanguages),
        rankedStream.tags,
        helper.displayLanguageList(rankedStream.detectedLanguages || [])
    );
    rankedStream.title = buildStreamTitle(streamInfo, rankedStream, tor.title || '');
    cb(rankedStream);
}

async function addResults(info, streams, source, abortSignals, runtimeConfig) {

    const [url, name] = source.split("||").length === 2 ? source.split("||") : [null, null];
    if (!url && !name) {
        console.error("Additional Sources not configured correctly.")
        return;
    }

    try {
        const controller = new AbortController();
        abortSignals.push(controller);
        const signal = controller.signal;

        const streamUrl = url + info.type + '/' + info.Id + (info.season && info.episode ? ':' + info.season + ':' + info.episode + '.json' : '.json');
        config.debug && console.log('Additional source url is :', streamUrl)
        const response = await axios.get(streamUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Encoding": "gzip, deflate",
                "Accept-Language": "en-US,en;q=0.9,el;q=0.8",
                'Cache-Control': 'public, max-age=604800'
            },
            timeout: config.responseTimeout,
            signal: signal
        });

        const index = abortSignals.indexOf(controller);
        if (index !== -1) {
            abortSignals.splice(index, 1); // Remove the controller from the array
        }

        const responseBody = response.data;
        if (!responseBody || !responseBody.streams || responseBody.streams.length === 0) {
            throw new Error(`Could not load any additional streams: ${response.status}`)
        }

        config.debug && console.log('Received ' + responseBody.streams.length + ' streams from ' + name)

        responseBody.streams.forEach(torrent => {
            const newStream = {}
            const quality = helper.findQuality(torrent.title);
            newStream.fileIdx = torrent.fileIdx;
            newStream.name = torrent.name.replace(name, runtimeConfig.addonName);
            newStream.tag = quality;
            newStream.type = info.type;
            newStream.infoHash = torrent.infoHash.toLowerCase();
            newStream.releaseTitle = torrent.title || '';
            newStream.from = name;
            newStream.sources = global.TRACKERS.map(x => { return "tracker:" + x; }).concat(["dht:" + torrent.infoHash]);

            helper.normalizeTitle(torrent, info);
            newStream.seeders = torrent.seeders;
            newStream.peers = torrent.peers || 0;
            newStream.size = torrent.size || 0;
            newStream.hdr = helper.hasHdr(torrent.title) ? 1 : 0;
            newStream.resolution = helper.resolutionRank(torrent.title);
            newStream.bitrate = helper.findBitrate(torrent.title);
            newStream.languages = torrent.languages || [];
            newStream.providerLanguages = torrent.providerLanguages || [];
            newStream.subtitleLanguages = torrent.subtitleLanguages || [];
            newStream.tags = torrent.tags || [];
            newStream.jackettDate = torrent.jackettDate || 0;

            newStream.behaviorHints = {
                bingieGroup: "Jackett|" + newStream.infoHash,
            }

            const rankedStream = decorateStreamRankingFields(newStream, runtimeConfig);
            rankedStream.name = buildStreamName(
                runtimeConfig,
                quality,
                helper.displayLanguageList(rankedStream.languages),
                helper.displayLanguageList(rankedStream.providerLanguages),
                helper.displayLanguageList(rankedStream.subtitleLanguages),
                rankedStream.tags,
                helper.displayLanguageList(rankedStream.detectedLanguages || [])
            );
            rankedStream.title = buildStreamTitle(info, rankedStream, torrent.title || '');
            streams.push(rankedStream);
            config.debug && console.log('Adding addition source stream: ', torrent)
        })
    } catch (error) {
        config.debug && console.error('Error finding addition source streams: ', error.message)
    }
}

async function handleStreamRequest(req, res, userConfig = {}) {

    if (!req.params.id)
        return respond(res, { streams: [] });

    const runtimeConfig = config.getRuntimeConfig(userConfig);
    const rdBaseUrl = getBaseUrl(req, req.params.userConfig || '');
    const formatStreams = streams => decorateStreamsForRealDebrid(streams, {
        token: runtimeConfig.realDebridApiKey,
        includeP2p: runtimeConfig.includeP2pFallback,
        baseUrl: rdBaseUrl,
        availabilityCache: realDebridAvailability,
    });
    config.debug && console.log("Received request for :", req.params.type, req.params.id);
    console.log(`R: ${req.params.id} / langs: ${runtimeConfig.allowedLanguages.join('>') || 'none'} / minRes: ${runtimeConfig.minimumResolution || 'any'} / sort: ${runtimeConfig.sortOrder.join('>')}`);
    const cacheKey = `${req.params.id}:${JSON.stringify({
        allowedLanguages: runtimeConfig.allowedLanguages,
        minimumResolution: runtimeConfig.minimumResolution,
        sortOrder: runtimeConfig.sortOrder,
    })}`;

    // cache
    if (runtimeConfig.cacheResultsTime && runtimeConfig.cacheResultsTime != 0 && !req.headers['no-cache']) {
        const cached = getCacheVariable(cacheKey, runtimeConfig.cacheResultsTime);
        if (cached) {
            console.log("C: " + req.params.id + " cached.");
            return respond(res, {
                streams: formatStreams(cached),
                "cacheMaxAge": 7200,
                "staleRevalidate": 14400,
                "staleError": 604800
            });
        }
    }

    let streamInfo = {};
    const streams = [];
    const abortSignals = [];

    const startTime = Date.now();

    function extractVideoInf(req, streamInfo) {
        if (req.params.id.startsWith("tmdb")) {
            const idParts = req.params.id.split(':');
            streamInfo.Id = idParts.slice(1).join(':');
            streamInfo.type = req.params.type;
            streamInfo.season = idParts[2] ? idParts[2] : null;
            streamInfo.episode = idParts[3] ? idParts[3] : null;
            streamInfo.db = "tmdb";
        } else {
            const idParts = req.params.id.split(':');
            streamInfo.Id = idParts[0];
            streamInfo.type = req.params.type;
            streamInfo.season = idParts[1] ? idParts[1] : null;
            streamInfo.episode = idParts[2] ? idParts[2] : null;
            streamInfo.db = "tt";
        }
    }

    extractVideoInf(req, streamInfo);


    try {
        await getStreamInfo(streamInfo, abortSignals);
    } catch (err) {
        console.error(err.message);
        return respond(res, { streams: [] });
    }

    if (runtimeConfig.additionalSources && streamInfo.db === 'tt') {
        runtimeConfig.additionalSources.forEach(source => {
            addResults(streamInfo, streams, source, abortSignals, runtimeConfig);
        });
    }

    console.log(`Q: ${req.params.id} / title: ${streamInfo.name} / year: ${streamInfo.year}`);

    let inProgressCount = 0;
    let searchFinished = false;
    let requestSent = false;

    const intervalId = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        if (!requestSent && ((elapsedTime >= runtimeConfig.responseTimeout) || (searchFinished && inProgressCount === 0 && asyncQueue.idle()))) {
            requestSent = true;
            asyncQueue.kill();
            config.debug && console.log("There are " + abortSignals.length + " controllers to abort.");
            abortSignals.forEach((controller) => {
                controller.abort();
            });

            clearInterval(intervalId);
            const finalData = processTorrentList(streams, runtimeConfig);
            config.debug && console.log("Sliced & Sorted data ", finalData);
            console.log(`A: ${req.params.id} / time: ${elapsedTime} / results: ${finalData.length} / timeout: ${(elapsedTime >= runtimeConfig.responseTimeout)} / search finished: ${searchFinished} / queue idle: ${asyncQueue.idle()} / pending downloads: ${inProgressCount} / discarded: ${(streams.length - finalData.length)}`);
            if (finalData.length > 0) {
                res.setHeader('Cache-Control', 'max-age=7200, stale-while-revalidate=14400, stale-if-error=604800, public');
                // Set cache-related headers if "streams" contains data
                if (runtimeConfig.cacheResultsTime && runtimeConfig.cacheResultsTime != 0) {
                    config.debug && console.log("Caching results for ", req.params.id);
                    setCacheVariable(cacheKey, finalData, runtimeConfig.cacheResultsTime)
                }
                return respond(res, {
                    streams: formatStreams(finalData),
                    "cacheMaxAge": 7200,
                    "staleRevalidate": 14400,
                    "staleError": 604800
                });
            } else {
                // If "streams" is empty, do not set cache-related headers
                return respond(res, {
                    streams: formatStreams(finalData)
                });
            }
        }
        config.debug && console.log(`S: id: ${streamInfo.Id} / time pending: ${(runtimeConfig.responseTimeout - elapsedTime)} / search finished: ${searchFinished} / queue idle: ${asyncQueue.idle()} / pending downloads: ${inProgressCount} / processed streams: ${streams.length}`);

    }, runtimeConfig.interval);

    const processMagnets = async (task) => {
        if (requestSent) {
            return;
        }
        const uri = task.magneturl || task.link;
        config.debug && console.log("Parsing magnet :", uri);
        const parsedTorrent = parseTorrent(uri);
        streamFromParsed(task, parsedTorrent, streamInfo, runtimeConfig, stream => {
            streams.push(stream);
        });
    };

    const processLinks = async (task) => {
        if (requestSent) {
            return;
        }
        inProgressCount++;
        try {
            const controller = new AbortController();
            const signal = controller.signal;
            abortSignals.push(controller)
            config.debug && console.log("Processing link: ", task.link);
            const response = await axios.get(task.link, {
                timeout: runtimeConfig.responseTimeout, // we don't want to overdo it here and neither set something in config. Request should timeout anyway.
                maxRedirects: 0,
                validateStatus: null,
                signal: signal,
                responseType: 'arraybuffer', // Specify the response type as 'arraybuffer'
            });
            const index = abortSignals.indexOf(controller);
            if (index !== -1) {
                abortSignals.splice(index, 1); // Remove the controller from the array
            }
            // It takes some time to dowload the torrent file and we don't want to continue althought it will probably timeout.
            if (requestSent || response.status >= 400) {
                config.debug && console.log("Abort processing of : " + task.link + " - " + (requestSent ? "Request sent is " + requestSent : "Response code : " + response.statusCode));
                inProgressCount--;
                return;
            }

            if (response && response.headers && response.headers.location) {
                if (response.headers.location.startsWith("magnet:")) {
                    task.magneturl = response.headers.location;
                    task.link = response.headers.location;
                    config.debug && console.log("Sending magnet task for process :", task.magneturl);
                    processMagnets(task);

                } else {
                    config.debug && console.error("Not a magnet link :", response.headers.location);
                }
            } else {
                const responseBody = Buffer.from(response.data);
                config.debug && console.log(`Processing torrent : ${task.link}.`);
                const parsedTorrent = parseTorrent(responseBody);
                streamFromParsed(task, parsedTorrent, streamInfo, runtimeConfig, stream => {
                    streams.push(stream);
                });
                config.debug && console.log("Parsed torrent : ", task.link);
            }
        } catch (err) {
            config.debug && console.log("Error processing link :", task.link, err.message);
        }
        inProgressCount--;
    };

    const asyncQueue = async.queue(processLinks, runtimeConfig.downloadTorrentQueue);


    jackettApi.search(streamInfo, runtimeConfig, abortSignals,
        (tempResults) => {
            if (!requestSent && tempResults && tempResults.length > 0) {
                const { magnets, links } = partitionURL(tempResults);
                Promise.all([...magnets.map(processMagnets)]);
                links.forEach(item => asyncQueue.push(item));
            }
        },

        () => {
            config.debug && console.log("Searching finished.");
            searchFinished = true;
        }
    );
}

// stream response
addon.get('/stream/:type/:id.json', async (req, res) => {
    return handleStreamRequest(req, res);
});

addon.get('/:userConfig/stream/:type/:id.json', async (req, res) => {
    return handleStreamRequest(req, res, config.getUserConfigFromRequest(req.params.userConfig));
});

function redirectToStatusVideo(res, filename) {
    return res.redirect(302, `${RD_STATUS_VIDEO_BASE_URL}/${filename}`);
}

async function handleRealDebridPlayback(req, res, userConfig = {}) {
    const runtimeConfig = config.getRuntimeConfig(userConfig);
    if (!runtimeConfig.realDebridApiKey) {
        return redirectToStatusVideo(res, 'failed_access_v2.mp4');
    }

    const infoHash = String(req.params.infoHash || '').toLowerCase();
    const fileIndex = parseInt(req.params.fileIndex, 10);
    if (!/^[a-f0-9]{40}$/.test(infoHash) || Number.isNaN(fileIndex) || fileIndex < -1) {
        return redirectToStatusVideo(res, 'failed_opening_v2.mp4');
    }

    try {
        const result = await resolveRealDebridStream({
            api: new RealDebridClient(runtimeConfig.realDebridApiKey),
            infoHash,
            fileIndex,
            availabilityCache: realDebridAvailability,
            waitForDownload: realDebridAvailability.has(infoHash, fileIndex),
        });
        if (result.status === 'ready') {
            return res.redirect(302, result.url);
        }
        return redirectToStatusVideo(res, 'downloading_v2.mp4');
    } catch (error) {
        console.error(`Real-Debrid playback failed for ${infoHash}: ${error.message}`);
        if ([8, 9, 20].includes(error.code)) {
            return redirectToStatusVideo(res, 'failed_access_v2.mp4');
        }
        if (error.code === 35) {
            return redirectToStatusVideo(res, 'failed_infringement_v2.mp4');
        }
        if ([21, 23, 26, 36].includes(error.code)) {
            return redirectToStatusVideo(res, 'limits_exceeded_v1.mp4');
        }
        return redirectToStatusVideo(res, 'failed_unexpected_v2.mp4');
    }
}

addon.get('/realdebrid/play/:infoHash/:fileIndex/:filename', async (req, res) => {
    return handleRealDebridPlayback(req, res);
});

addon.get('/:userConfig/realdebrid/play/:infoHash/:fileIndex/:filename', async (req, res) => {
    return handleRealDebridPlayback(req, res, config.getUserConfigFromRequest(req.params.userConfig));
});

const runAddon = async () => {
    config.addonPort = await getPort({ port: config.addonPort });

    const updateTrackers = async () => {
        const { trackers, blacklist_trackers } = await getTrackers();
        global.TRACKERS = trackers;
        global.BLACKLIST_TRACKERS = blacklist_trackers;
        config.debug && console.log("Loaded all trackers !");
    };

    await updateTrackers();
    setInterval(updateTrackers, config.updateTrackersInterval * 60 * 1000);

    configureConnectionPooling();
    addon.listen(config.addonPort, () => {
        console.log("Version: " + version + ' Add-on Manifest URL: http://{{ IP ADDRESS }}:' + config.addonPort + '/manifest.json');
    });
};

runAddon();

