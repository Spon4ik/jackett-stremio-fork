const axios = require('axios');
const querystring = require('querystring');

const API_BASE_URL = 'https://api.real-debrid.com/rest/1.0';
const AVAILABILITY_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const VIDEO_EXTENSIONS = /\.(mkv|mp4|avi|mov|m4v|webm|ts|m2ts)$/i;

class RealDebridError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'RealDebridError';
    this.code = code;
    this.status = status;
  }
}

class RealDebridClient {
  constructor(token, options = {}) {
    this.token = token;
    this.http = options.http || (request => axios(request));
    this.baseUrl = options.baseUrl || API_BASE_URL;
    this.timeout = options.timeout || 10000;
  }

  async request(method, path, data) {
    const headers = { Authorization: `Bearer ${this.token}` };
    let body;
    if (data) {
      body = querystring.stringify(data);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    try {
      const response = await this.http({
        method,
        url: `${this.baseUrl}${path}`,
        headers,
        data: body,
        timeout: this.timeout,
        validateStatus: status => status >= 200 && status < 300,
      });
      return response.data;
    } catch (error) {
      const response = error.response;
      const code = response && response.data && response.data.error_code;
      const message = response && response.data && response.data.error
        ? response.data.error
        : error.message;
      throw new RealDebridError(message, code, response && response.status);
    }
  }

  addMagnet(magnet) {
    return this.request('post', '/torrents/addMagnet', { magnet });
  }

  selectFiles(id, files) {
    return this.request('post', `/torrents/selectFiles/${encodeURIComponent(id)}`, { files: String(files) });
  }

  getTorrentInfo(id) {
    return this.request('get', `/torrents/info/${encodeURIComponent(id)}`);
  }

  async listTorrents(page = 1, limit = 100) {
    return this.request('get', `/torrents?page=${page}&limit=${limit}`);
  }

  async findTorrentByHash(infoHash) {
    const target = infoHash.toLowerCase();
    for (let page = 1; page <= 5; page++) {
      const torrents = await this.listTorrents(page, 100) || [];
      const found = torrents.find(torrent => String(torrent.hash || '').toLowerCase() === target);
      if (found) {
        return found;
      }
      if (torrents.length < 100) {
        break;
      }
    }
    return null;
  }

  unrestrictLink(link) {
    return this.request('post', '/unrestrict/link', { link });
  }

  async waitForTorrent(id, targetStatus = 'downloaded', options = {}) {
    const attempts = options.attempts || 15;
    const intervalMs = options.intervalMs || 2000;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const torrent = await this.getTorrentInfo(id);
      if (torrent.status === targetStatus) {
        return torrent;
      }
      if (['error', 'magnet_error', 'virus', 'dead'].includes(torrent.status)) {
        throw new RealDebridError(`Torrent entered terminal status: ${torrent.status}`);
      }
      if (attempt + 1 < attempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
    return null;
  }
}

class RealDebridAvailabilityCache {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.ttlMs = options.ttlMs || AVAILABILITY_TTL_MS;
    this.entries = new Map();
  }

  remember(infoHash, fileIds) {
    const key = infoHash.toLowerCase();
    const entry = this.entries.get(key) || { selections: [], expiresAt: 0 };
    const normalized = [...new Set(fileIds.map(Number))].sort((a, b) => a - b);
    if (!entry.selections.some(ids => ids.join(',') === normalized.join(','))) {
      entry.selections.push(normalized);
    }
    entry.expiresAt = this.now() + this.ttlMs;
    this.entries.set(key, entry);
  }

  has(infoHash, fileIndex) {
    const key = infoHash.toLowerCase();
    const entry = this.entries.get(key);
    if (!entry || this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return false;
    }
    const fileId = Number(fileIndex) + 1;
    return entry.selections.some(ids => ids.includes(fileId));
  }
}

function encodePathPart(value) {
  return encodeURIComponent(String(value || '').replace(/[\r\n]/g, ' ').slice(0, 180));
}

function decorateStreamsForRealDebrid(streams, options) {
  if (!options.token) {
    return streams;
  }

  const result = [];
  for (const stream of streams) {
    if (!stream.infoHash) {
      continue;
    }
    const fileIndex = Number.isInteger(stream.fileIdx) ? stream.fileIdx : -1;
    const cached = options.availabilityCache.has(stream.infoHash, fileIndex);
    const label = cached ? '[RD+]' : '[RD download]';
    const filename = stream.behaviorHints && stream.behaviorHints.filename
      ? stream.behaviorHints.filename
      : stream.releaseTitle || stream.title || 'video';
    const rdStream = {
      ...stream,
      name: `${label} ${stream.name}`,
      url: `${options.baseUrl}/realdebrid/play/${stream.infoHash.toLowerCase()}/${fileIndex}/${encodePathPart(filename)}`,
    };
    delete rdStream.infoHash;
    delete rdStream.fileIdx;
    delete rdStream.sources;
    result.push(rdStream);

    // Keep the torrent-shaped stream as well as the RD URL. Stremio uses
    // infoHash/sources to expose its magnet action; the RD URL cannot provide it.
    result.push({ ...stream, name: `[Magnet] ${stream.name}` });
  }
  return result;
}

function selectTargetFile(torrent, fileIndex) {
  const files = torrent.files || [];
  return files.find(file => file.id === Number(fileIndex) + 1)
    || files.filter(file => VIDEO_EXTENSIONS.test(file.path || '')).sort((a, b) => b.bytes - a.bytes)[0];
}

async function resolveRealDebridStream(options) {
  const { api, infoHash, fileIndex, availabilityCache, waitForDownload } = options;
  let torrent = await api.findTorrentByHash(infoHash);
  if (!torrent) {
    torrent = await api.addMagnet(`magnet:?xt=urn:btih:${infoHash}`);
  }
  torrent = await api.getTorrentInfo(torrent.id);

  if (torrent.status === 'downloaded') {
    return unrestrictTorrent(api, torrent, fileIndex, availabilityCache);
  }

  if (['magnet_conversion', 'waiting_files_selection'].includes(torrent.status)) {
    if (torrent.status === 'magnet_conversion') {
      torrent = await api.waitForTorrent(torrent.id, 'waiting_files_selection');
    }
    if (!torrent) {
      return { status: 'downloading' };
    }
    const target = selectTargetFile(torrent, fileIndex);
    if (!target) {
      throw new RealDebridError('No playable file found in torrent');
    }
    await api.selectFiles(torrent.id, target.id);
  }

  if (!waitForDownload) {
    return { status: 'downloading' };
  }
  const downloaded = await api.waitForTorrent(torrent.id, 'downloaded');
  if (!downloaded) {
    return { status: 'downloading' };
  }
  return unrestrictTorrent(api, downloaded, fileIndex, availabilityCache);
}

async function unrestrictTorrent(api, torrent, fileIndex, availabilityCache) {
  const target = selectTargetFile(torrent, fileIndex);
  if (!target || !target.selected) {
    throw new RealDebridError('Requested file is not selected');
  }
  const selected = (torrent.files || []).filter(file => file.selected);
  const linkIndex = selected.findIndex(file => file.id === target.id);
  const link = torrent.links && (torrent.links.length === 1 ? torrent.links[0] : torrent.links[linkIndex]);
  if (!link) {
    throw new RealDebridError('No Real-Debrid link available');
  }
  const unrestricted = await api.unrestrictLink(link);
  if (!unrestricted || !unrestricted.download) {
    throw new RealDebridError('Real-Debrid did not return a download URL');
  }
  availabilityCache.remember(torrent.hash || '', selected.map(file => file.id));
  return { status: 'ready', url: unrestricted.download };
}

module.exports = {
  RealDebridClient,
  RealDebridError,
  RealDebridAvailabilityCache,
  decorateStreamsForRealDebrid,
  resolveRealDebridStream,
};
