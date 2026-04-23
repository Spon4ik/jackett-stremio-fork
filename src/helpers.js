const videoNameParser = require('video-name-parser');

const LANGUAGE_PATTERNS = {
    ru: [/\brus(?:sian)?\b/i, /\bru\b/i, /\bрус(?:ский)?\b/i],
    he: [/\bheb(?:rew)?\b/i, /\bhe\b/i, /עברית/i],
    en: [/\beng(?:lish)?\b/i, /\ben\b/i],
};

const RESOLUTION_RANKS = {
    '480p': 480,
    '576p': 576,
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,
    '2160p': 2160,
    '4k': 2160,
};

const LANGUAGE_ALIASES = {
    russian: 'ru',
    hebrew: 'he',
    english: 'en',
    israeli: 'he',
};

const LANGUAGE_LABELS = {
    ru: 'RU',
    he: 'HE',
    en: 'EN',
};

const SORT_FIELDS = ['hdr', 'resolution', 'bitrate', 'size', 'peers', 'seeders'];
const TITLE_STOP_WORDS = ['a', 'an', 'the'];
const RELEASE_WORDS = [
    'amzn', 'atvp', 'avc', 'bd', 'bdrip', 'bluray', 'dl', 'dldub', 'dlrip',
    'dvd', 'dvdrip', 'hdtv', 'hdrezka', 'hevc', 'internal', 'lostfilm', 'proper',
    'repack', 'rg', 'rus', 'sub', 'subs', 'truehd', 'web', 'webdl', 'webrip',
    'x264', 'x265', 'xvid'
];

function numberInRange(value, start, end) {
    const normalizedValue = parseInt(value, 10);
    const normalizedStart = parseInt(start, 10);
    const normalizedEnd = end === undefined || end === null ? normalizedStart : parseInt(end, 10);

    if (Number.isNaN(normalizedValue) || Number.isNaN(normalizedStart) || Number.isNaN(normalizedEnd)) {
        return false;
    }

    return normalizedValue >= Math.min(normalizedStart, normalizedEnd)
        && normalizedValue <= Math.max(normalizedStart, normalizedEnd);
}

function matchesEpisodeRegex(title, season, episode, regex) {
    let match = regex.exec(title);
    while (match) {
        if (parseInt(match[1], 10) === parseInt(season, 10) && numberInRange(episode, match[2], match[3])) {
            return true;
        }

        match = regex.exec(title);
    }

    return false;
}

const helper = {
    unique: (array) => {
        return Array.from(new Set(array));
    },

    // Function to insert an object into a sorted list based on a property (descending order) with maxSize. 
    // sortingProperty must be an int to compare.
    // Object must have the properties.
    insertIntoSortedArray: (sortedArray, newObject, sortingProperty, maxSize) => {
        const indexToInsert = sortedArray.findIndex(item => item[sortingProperty] < newObject[sortingProperty]);

        if (indexToInsert === -1) {
            if (sortedArray.length < maxSize) {
                sortedArray.push(newObject);
                return true;
            }
            return false;
        } else {
            // Insert the new object at the correct position to maintain the sorted order (descending)
            sortedArray.splice(indexToInsert, 0, newObject);
            // Trim the array if it exceeds maxSize
            if (sortedArray.length > maxSize) {
                sortedArray.pop();
            }
            return true;
        }
    },

    toHomanReadable: (bytes) => {
        if (Math.abs(bytes) < 1024) { return bytes + ' B'; }

        const units = ['kb', 'mb', 'gb', 'tb'];

        let i = -1;
        do {
            bytes /= 1024;
            ++i;
        } while (Math.abs(bytes) >= 1024 && i < units.length - 1);

        return bytes.toFixed(1) + " " + units[i];
    },

    episodeTag: (season, episode) => {
        const paddedSeason = season < 10 ? `0${season}` : season;
        const paddedEpisode = episode < 10 ? `0${episode}` : episode;
        return `S${paddedSeason}E${paddedEpisode}`;
    },

    simpleName: (name) => {
        name = name.replace(/\.|_|-|–|\(|\)|\[|\]|:|,/g, ' ');
        name = name.replace(/\s+/g, ' ');
        name = name.replace(/'/g, '');
        name = name.replace(/\\\\/g, '\\').replace(/\\\\'|\\'|\\\\"|\\"/g, '');
        return name;
    },

    normalizeMatchText: (value) => {
        return helper.simpleName(String(value || ''))
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    matchTokens: (value) => {
        return helper.normalizeMatchText(value)
            .split(' ')
            .filter(token => token.length > 0);
    },

    requestedTitleTokens: (value) => {
        return helper.matchTokens(value)
            .filter(token => !TITLE_STOP_WORDS.includes(token));
    },

    containsMatchTokens: (value, tokens) => {
        if (!tokens || tokens.length === 0) {
            return true;
        }

        const valueTokens = helper.matchTokens(value);
        return tokens.every(token => valueTokens.includes(token));
    },

    hasMeaningfulLatinTitleCandidate: (value) => {
        const latinSegments = String(value || '').match(/[A-Za-z0-9][A-Za-z0-9 .'-]*/g) || [];
        return latinSegments.some(segment => {
            const tokens = helper.matchTokens(segment)
                .filter(token => !TITLE_STOP_WORDS.includes(token))
                .filter(token => !RELEASE_WORDS.includes(token))
                .filter(token => !/^\d{3,4}p$/.test(token))
                .filter(token => !/^\d{4}$/.test(token));

            return tokens.length > 0;
        });
    },

    titleBeforeEpisodeTag: (title) => {
        return String(title || '').split(/\bS\s*0*\d{1,2}\s*E\s*0*\d{1,3}|\b0*\d{1,2}\s*x\s*0*\d{1,3}/i)[0];
    },

    titleMatchesRequestedName: (title, requestedName) => {
        const requestedTokens = helper.requestedTitleTokens(requestedName);
        if (requestedTokens.length === 0 || helper.containsMatchTokens(title, requestedTokens)) {
            return true;
        }

        const titleHead = helper.titleBeforeEpisodeTag(title);
        return !helper.hasMeaningfulLatinTitleCandidate(titleHead);
    },

    titleMatchesRequestedEpisode: (title, season, episode) => {
        if (!season || !episode) {
            return true;
        }

        const normalizedTitle = String(title || '');
        const requestedSeason = parseInt(season, 10);
        const requestedEpisode = parseInt(episode, 10);

        if (Number.isNaN(requestedSeason) || Number.isNaN(requestedEpisode)) {
            return true;
        }

        const sxxexxRegex = /\bS\s*0*(\d{1,2})\s*E\s*0*(\d{1,3})(?:\s*(?:-|–|—|to)\s*(?:E\s*)?0*(\d{1,3}))?\b/gi;
        if (matchesEpisodeRegex(normalizedTitle, requestedSeason, requestedEpisode, sxxexxRegex)) {
            return true;
        }

        const xEpisodeRegex = /\b0*(\d{1,2})\s*x\s*0*(\d{1,3})(?:\s*(?:-|–|—|to)\s*(?:x)?0*(\d{1,3}))?\b/gi;
        if (matchesEpisodeRegex(normalizedTitle, requestedSeason, requestedEpisode, xEpisodeRegex)) {
            return true;
        }

        const wordEpisodeRegex = /\b(?:season|сезон)\s*0*(\d{1,2}).{0,50}?\b(?:episode|episodes|ep|серия|серии|серий)\s*0*(\d{1,3})(?:\s*(?:-|–|—|to)\s*0*(\d{1,3}))?/gi;
        return matchesEpisodeRegex(normalizedTitle, requestedSeason, requestedEpisode, wordEpisodeRegex);
    },

    titleMatchesRequestedContent: (title, query) => {
        if (!query || query.type !== 'series' || !query.season || !query.episode) {
            return true;
        }

        return helper.titleMatchesRequestedEpisode(title, query.season, query.episode)
            && helper.titleMatchesRequestedName(title, query.name);
    },

    findQuality: (tag) => {
        const regex = /DLRip|HDTV|\b(DivX|XviD)\b|\b(?:DL|WEB|BD|BR)MUX\b|\bWEB-?Rip\b|\bWEB-?DL\b|\b(WEB|Telecine|CAMRip|HQCAM)\b|\bBluray\b|\bVHSSCR\b|\bR5\b|\bPPVRip\b|\bTC\b|\b(?:HD-?)?TVRip\b|\bDVDscr\b|\bDVD(?:R[0-9])?\b|\bDVDRip\b|\bBDRip\b|\bBRRip\b|\bHD-?Rip\b|\b(?:HD-?)?T(?:ELE)?S(?:YNC)?\b|\b(?:HD-?)?CAM\b/i;
        const regexP = /(4k)|([0-9]{3,4}[pi])/i;
        const match = tag.match(regex);
        const matchP = tag.match(regexP);
        let quality = "";
        if (match !== null) {
            quality = match[0];
        } else if (matchP !== null) {
            quality = matchP[0];
        }
        return quality;

    },

    findResolution: (tag) => {
        const match = tag.match(/\b(2160p|1440p|1080p|720p|576p|480p|4k)\b/i);
        return match ? match[1].toLowerCase() : "";
    },

    resolutionRank: (tag) => {
        const resolution = helper.findResolution(tag);
        return RESOLUTION_RANKS[resolution] || 0;
    },

    passesMinimumResolution: (tag, minimumResolution) => {
        if (!minimumResolution) {
            return true;
        }

        const configuredRank = RESOLUTION_RANKS[minimumResolution];
        if (!configuredRank) {
            return true;
        }

        const foundResolution = helper.findResolution(tag);
        const foundRank = RESOLUTION_RANKS[foundResolution];
        if (!foundRank) {
            return false;
        }

        return foundRank >= configuredRank;
    },

    matchesAllowedLanguages: (tag, allowedLanguages) => {
        if (!allowedLanguages || allowedLanguages.length === 0) {
            return true;
        }

        return allowedLanguages.some(language => {
            const normalizedLanguage = LANGUAGE_ALIASES[language] || language;
            const patterns = LANGUAGE_PATTERNS[normalizedLanguage];
            if (!patterns) {
                return false;
            }

            return patterns.some(pattern => pattern.test(tag));
        });
    },

    findLanguage: (tag, allowedLanguages = []) => {
        const candidateLanguages = allowedLanguages.length > 0 ? allowedLanguages : Object.keys(LANGUAGE_PATTERNS);

        for (const language of candidateLanguages) {
            const normalizedLanguage = LANGUAGE_ALIASES[language] || language;
            const patterns = LANGUAGE_PATTERNS[normalizedLanguage];

            if (patterns && patterns.some(pattern => pattern.test(tag))) {
                return normalizedLanguage;
            }
        }

        return '';
    },

    normalizeLanguageValue: (value) => {
        if (!value) {
            return '';
        }

        const normalizedValue = String(value).trim().toLowerCase();
        const baseLanguage = normalizedValue.split(/[-_]/)[0];

        if (LANGUAGE_ALIASES[normalizedValue]) {
            return LANGUAGE_ALIASES[normalizedValue];
        }

        if (LANGUAGE_ALIASES[baseLanguage]) {
            return LANGUAGE_ALIASES[baseLanguage];
        }

        if (LANGUAGE_PATTERNS[normalizedValue]) {
            return normalizedValue;
        }

        if (LANGUAGE_PATTERNS[baseLanguage]) {
            return baseLanguage;
        }

        for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
            if (patterns.some(pattern => pattern.test(normalizedValue))) {
                return language;
            }
        }

        return normalizedValue;
    },

    normalizeLanguageList: (values = []) => {
        return helper.unique(
            values
                .flatMap(value => String(value).split(','))
                .map(value => helper.normalizeLanguageValue(value))
                .filter(Boolean)
        );
    },

    hasMatchingLanguage: (values = [], allowedLanguages = []) => {
        if (!allowedLanguages || allowedLanguages.length === 0) {
            return true;
        }

        const normalizedValues = helper.normalizeLanguageList(values);
        if (normalizedValues.length === 0) {
            return false;
        }

        const normalizedAllowedLanguages = helper.normalizeLanguageList(allowedLanguages);
        return normalizedValues.some(language => normalizedAllowedLanguages.includes(language));
    },

    passesLanguageFilter: (tag, allowedLanguages = [], providerLanguages = [], explicitLanguages = []) => {
        if (!allowedLanguages || allowedLanguages.length === 0) {
            return true;
        }

        const normalizedProviderLanguages = helper.normalizeLanguageList(providerLanguages);
        if (normalizedProviderLanguages.length > 0) {
            return helper.hasMatchingLanguage(normalizedProviderLanguages, allowedLanguages);
        }

        const normalizedExplicitLanguages = helper.normalizeLanguageList(explicitLanguages);
        if (normalizedExplicitLanguages.length > 0) {
            return helper.hasMatchingLanguage(normalizedExplicitLanguages, allowedLanguages);
        }

        const detectedLanguage = helper.findLanguage(tag, Object.keys(LANGUAGE_PATTERNS));
        if (detectedLanguage) {
            return helper.hasMatchingLanguage([detectedLanguage], allowedLanguages);
        }

        return true;
    },

    displayLanguageList: (values = []) => {
        return helper.normalizeLanguageList(values)
            .map(language => LANGUAGE_LABELS[language] || language.toUpperCase());
    },

    languagePreferenceIndex: (tag, preferredLanguages, explicitLanguages = []) => {
        if (!preferredLanguages || preferredLanguages.length === 0) {
            return Number.MAX_SAFE_INTEGER;
        }

        const normalizedExplicitLanguages = helper.normalizeLanguageList(explicitLanguages);
        const candidateLanguages = normalizedExplicitLanguages.length > 0
            ? normalizedExplicitLanguages
            : [helper.findLanguage(tag, preferredLanguages)].filter(Boolean);

        if (candidateLanguages.length === 0) {
            return Number.MAX_SAFE_INTEGER;
        }

        const indexes = candidateLanguages
            .map(foundLanguage => preferredLanguages.findIndex(language => (LANGUAGE_ALIASES[language] || language) === foundLanguage))
            .filter(index => index !== -1);

        return indexes.length > 0 ? Math.min(...indexes) : Number.MAX_SAFE_INTEGER;
    },

    languagePriorityCandidates: (providerLanguages = [], explicitLanguages = [], detectedLanguages = []) => {
        return helper.unique([
            ...helper.normalizeLanguageList(providerLanguages),
            ...helper.normalizeLanguageList(explicitLanguages),
            ...helper.normalizeLanguageList(detectedLanguages),
        ]);
    },

    hasHdr: (tag) => {
        return /\b(?:hdr10\+?|hdr|dolby[ .-]?vision|dv)\b/i.test(tag);
    },

    findBitrate: (tag) => {
        const match = tag.match(/\b(\d+(?:\.\d+)?)\s*(gbps|gbit|gib\/s|gb\/s|mbps|mbit|mib\/s|mb\/s|kbps|kbit|kib\/s|kb\/s)\b/i);
        if (!match) {
            return 0;
        }

        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        if (unit.startsWith('g')) {
            return value * 1000 * 1000;
        }

        if (unit.startsWith('m')) {
            return value * 1000;
        }

        return value;
    },

    normalizeSortOrder: (sortOrder) => {
        if (!Array.isArray(sortOrder) || sortOrder.length === 0) {
            return ['hdr', 'resolution', 'bitrate', 'size', 'peers'];
        }

        const uniqueSorts = [];
        sortOrder.forEach(sortField => {
            if (SORT_FIELDS.includes(sortField) && !uniqueSorts.includes(sortField)) {
                uniqueSorts.push(sortField);
            }
        });

        return uniqueSorts.length > 0 ? uniqueSorts : ['hdr', 'resolution', 'bitrate', 'size', 'peers'];
    },

    compareStreams: (left, right, runtimeConfig) => {
        const leftHasLanguageTags = left.hasLanguageTags ?? 0;
        const rightHasLanguageTags = right.hasLanguageTags ?? 0;
        if (leftHasLanguageTags !== rightHasLanguageTags) {
            return rightHasLanguageTags - leftHasLanguageTags;
        }

        const leftLanguageRank = left.languageRank ?? Number.MAX_SAFE_INTEGER;
        const rightLanguageRank = right.languageRank ?? Number.MAX_SAFE_INTEGER;
        if (leftLanguageRank !== rightLanguageRank) {
            return leftLanguageRank - rightLanguageRank;
        }

        const sortOrder = helper.normalizeSortOrder(runtimeConfig.sortOrder);
        for (const sortField of sortOrder) {
            const leftValue = left[sortField] ?? 0;
            const rightValue = right[sortField] ?? 0;

            if (leftValue !== rightValue) {
                return rightValue - leftValue;
            }
        }

        if ((left.seeders ?? 0) !== (right.seeders ?? 0)) {
            return (right.seeders ?? 0) - (left.seeders ?? 0);
        }

        return (right.jackettDate ?? 0) - (left.jackettDate ?? 0);
    },

    containsRejectedKeyword: (tag, rejectKeywords) => {
        if (!rejectKeywords || rejectKeywords.length === 0) {
            return false;
        }

        const lowerTag = tag.toLowerCase();
        return rejectKeywords.some(keyword => lowerTag.includes(keyword));
    },

    normalizeTitle: (torrent, info) => {
        let name = '👤 11/2 💾 2 gb ⚙️ therarbg';
        let found = false;
        const title_list = torrent.title.split("\n");
        title_list.forEach(element => {
            if (element.includes("👤")) {
                name = element;
                if (!name.includes("⚙️")) {
                    name += " ⚙️ therarbg";
                }
                const match = name.match(/👤 (\d+)/);
                if (match) {
                    const digit = match[1];
                    if (!name.match(/👤 \d+\/\d+/)) {
                        const seeds = Math.round(digit / 1.1);
                        const leechers = Math.round(digit * 0.6);
                        name = name.replace(/👤 (\d+)/, `👤 ${seeds}/${leechers}`).toLowerCase();
                        torrent.title = info.name + ' ' + (info.season && info.episode ? ` ${helper.episodeTag(info.season, info.episode)}` : info.year) + '\n';
                        torrent.title += '\r\n' + name;
                        torrent.seeders = seeds;
                        found = true;
                        return;
                    }
                }

            }
        });
        if (!found) {
            torrent.title = info.name + ' ' + (info.season && info.episode ? ` ${helper.episodeTag(info.season, info.episode)}` : info.year) + '\n';
            torrent.title += '\r\n' + name;
            torrent.seeders = 11;
        }
    },

    parseVideo: (name) => {
        return videoNameParser(name + '.mp4');
    },

    extraTag: (name, searchQuery) => {
        const parsedName = helper.parseVideo(name + '.mp4');
        let extraTag = helper.simpleName(name);
        searchQuery = helper.simpleName(searchQuery);

        extraTag = extraTag.replace(new RegExp(searchQuery, 'gi'), '');
        extraTag = extraTag.replace(new RegExp(parsedName.name, 'gi'), '');

        if (parsedName.year) {
            extraTag = extraTag.replace(parsedName.year.toString(), '');
        }

        if (parsedName.season && parsedName.episode && parsedName.episode.length) {
            extraTag = extraTag.replace(new RegExp(helper.episodeTag(parsedName.season, parsedName.episode[0]), 'gi'), '');
        }

        extraTag = extraTag.trim();

        let extraParts = extraTag.split(' ');

        if (parsedName.season && parsedName.episode && parsedName.episode.length) {
            if (extraParts[0] && extraParts[0].length === 2 && !isNaN(extraParts[0])) {
                const possibleEpTag = `${helper.episodeTag(parsedName.season, parsedName.episode[0])}-${extraParts[0]}`;
                if (name.toLowerCase().includes(possibleEpTag.toLowerCase())) {
                    extraParts[0] = possibleEpTag;
                }
            }
        }

        const foundPart = name.toLowerCase().indexOf(extraParts[0].toLowerCase());

        if (foundPart > -1) {
            extraTag = name.substr(foundPart).replace(/_|\(|\)|\[|\]|,/g, ' ');

            if ((extraTag.match(/\./g) || []).length > 1) {
                extraTag = extraTag.replace(/\./g, ' ');
            }

            extraTag = extraTag.replace(/\s+/g, ' ');
        }

        return extraTag;
    },
};

module.exports = helper;
