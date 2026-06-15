# Jackett Stremio Fork

## General
This is a Stremio addon that requires [Jackett](https://github.com/Jackett/Jackett) to search for torrents, which can be installed and run locally. To add the addon to Stremio, use the provided URL, and it should provide you with search results. By default, this addon will only work when the Stremio web player uses HTTP. If you want to use it with an HTTPS Stremio web player, you'll also need to ensure that the service is running with HTTPS. Please note that teaching you how to achieve this is beyond the scope of this guide.

You can take a look at my other repo if you want to have stremio run in HTTP in docker [stremio-docker](https://github.com/tsaridas/stremio-docker) .

## Showcase

You can find the addon's manifest at [Beamup-Club](https://a0964931e94e-jackett-stremio.baby-beamup.club/manifest.json). Simply copy the link and paste it into your Stremio addons.

This addon is connected to specific Jackett servers with a limited number of indexers, so it may not produce many results in most cases. For better results, you can install the plugin locally and set up your own indexers in Jackett.


## Run
Images are pushed to [Docker Hub](https://hub.docker.com/r/tsaridas/jackett-stremio) for each release automatically.

<pre>
$ docker run -d \
  --name=jackett-stremio \
  -e JACKETT_HOSTS=http://{{ YOURIP }}:9117/ \ # Replace `{{ YOUR IP }}` with your LAN IP.
  -e JACKETT_APIKEYS={{ THE API KEY }} # Replace {{ THE API KEY }} with the key you got from the jacket server.
  -p 7000:7000/tcp \
  --restart unless-stopped \
  tsaridas/jackett-stremio:latest
</pre>

One could also run it outside docker. You need nodejs installed.

```bash
$ export JACKETT_HOSTS={{ YOUR JACKETT IP:PORT }} # Replace `{{ YOUR JACKETT IP:PORT }}` with your ip and Jackett port.
$ export JACKETT_APIKEYS={{ YOUR JACKETT API KEY }} # Replace `{{ YOUR JACKETT API KEY }}` with your Jackett API key.
$ npm install
$ npm start
```

## Options
The below options can be set as an evironment variable.

| Env | Default | Example | Description |
| - | - | - | - |
| `JACKETT_HOSTS` | http://127.0.0.1:9117/ | `http://IP1:9117/, http://IP2:9117/` | Your Jackett hosts comma delimited.|
| `JACKETT_APIKEYS` | '' | `sdfsadfs,sdfsadfsa` | API keys from jackett servers comma delimited. |
| `ADDON_NAME` | 'Jackett' | `MyJacketAddon` | The name of the addon that will show in stremio. |
| `JACKETT_RTIMEOUT` | 8000 | `20000` | Jackett http read timeout in millisecond. Don't set these higher than the RESPONSE_TIMEOUT. |
| `DONT_PARSE_TORRENT_FILES` | false | `true` | Parsing torrent files ( not magnets) takes time and is slow. This is disabled by default. **If enabled you will see less results depending on your indexer**. |
| `DOWNLOAD_TORRENT_QUEUE` | 10 | `100` | Because external http downloads go through Jackett doing many downloads at the same time might cause some DDOS so I setup a queue for this. |
| `RESPONSE_TIMEOUT` | 8000 | `12000` | This is the maximun time in millisecond that the request will last. The higher the most result you will get from slow indexers. |
| `PORT` | 7000 | `8888` | The port which the Addon service will run on. |
| `MIN_SEED` | ignored | `10` | Optional minimum seed filter. Leave empty or set `0` to ignore. |
| `MAX_RESULTS` | 5 | `10` | Maximum results to return. |
| `MAX_SIZE` | ignored | `5GB` | Optional maximum size filter. Leave empty to ignore. Supported formats: B/KB/MB/GB/TB. |
| `ALLOWED_LANGUAGES` | '' | `ru,he` | Comma-separated language filter and priority order. Jackett provider/indexer language is preferred, then item language tags, then release-title detection. |
| `MIN_RESOLUTION` | '' | `720p` | Minimum resolution filter. Supported values: `480p`, `576p`, `720p`, `1080p`, `1440p`, `2160p`, `4k`. Results without a detectable resolution are dropped when this is set. |
| `REJECT_KEYWORDS` | '' | `cam,ts,telecine` | Comma-separated title substrings to reject even if other filters pass. |
| `SORT_ORDER` | `hdr,resolution,bitrate,size,peers` | `resolution,seeders,size` | Ranking fields applied after language priority. Supported values: `hdr`, `resolution`, `bitrate`, `size`, `peers`, `seeders`. |
| `DEBUG` | false | `true` | Spams your terminal with info. |
| `SEARCH_BY_TYPE` | false | `true` | By enabling this, we search by movie or tvshow instead of default search by category (2000,5000). |
| `INTERVAL` | 500 | `100` | How often to check in miliseconds if we should return results based on user's timeout. |
| `ADD_BEST_TRACKERS` | false | `true` | We download a list of best trackers from [Best Trackers](https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt) and add them to all torrents found |
| `ADD_RUSSIAN_TRACKERS` | false | `true` | We add some Russian trackers. Check trackers.js for more info.|
| `ADD_EXTRA_TRACKERS` | false | `true` | We add some extra trackers. Check trackers.js for more info. |
| `REMOVE_BLACKLIST_TRACKERS` | false | `true` | Remove trackers that are blacklisted. Download list from : [Blacklisted trackers](https://raw.githubusercontent.com/ngosang/trackerslist/master/blacklist.txt") |
| `INDEXER_FILTERS` | status:healthy,test:passed | `all` | This is the filter when we fetch indexers. This config is clear text, we encode it before using. [Jackett Documentation](https://github.com/Jackett/Jackett/tree/v0.21.1594?tab=readme-ov-file#filter-indexers) |
| `CACHE_INDEXERS_TIME` | 30 | `360` | The time in minutes to cache indexers and don't call jackett to get all of them every time.|
| `CACHE_RESULTS_TIME` | 180 | `360` | The time in minutes to cache results in memory. Set to 0 to disable and always search in jackett.|
| `TMDB_APIKEY` | 'sdfasdf23r' | `` | TMDB API key.|
| `REAL_DEBRID_API_KEY` | '' | `your_private_token` | Optional Real-Debrid token. When set, Jackett results are returned as RD playback URLs instead of raw torrents. |
| `INCLUDE_P2P_FALLBACK` | false | `true` | Also return an explicitly labeled raw P2P copy beside each RD result. |
| `RD_STATUS_VIDEO_BASE_URL` | `https://torrentio.strem.fun/videos` | `https://example/videos` | Base URL for downloading/error status videos returned during RD playback. |



## Builds

Builds are configured to generate images for the following architectures:

- linux/arm/v6
- linux/amd64
- linux/arm64/v8
- linux/arm/v7

If you ever need additional build architectures, feel free to ask. However, it's unlikely that anyone will require these containers to be installed on anything other than these specified architectures.

## Images

* latest -> Builds automatically when new version of server or WebPlayer is released. Builds WebPlayer only from release tags.
* release version (example v1.0.0) -> to have old releases available in case there is something wrong with new release.

### Build your own

You can build your own image by running the below command.

```bash
docker build -t jackett-stremio:myversion .
```

## Jackett
You need jackett installed for this addon to work. Going into detail on how to do that is out of the scope of this project.

## Custom filtering

This fork adds small Stremio-oriented filters:

- `ALLOWED_LANGUAGES=ru,he` keeps and ranks releases by Jackett provider language first, then item language tags, then title detection.
- `MIN_RESOLUTION=720p` keeps only releases at or above the configured resolution.
- `MIN_SEED` and `MAX_SIZE` are optional. By default they are ignored so valid low-seed or pack results are not hidden.
- `REJECT_KEYWORDS=cam,ts,telecine` removes noisy releases by title substring.

## Real-Debrid playback

Set `REAL_DEBRID_API_KEY` or enter a token on the configure page. The addon keeps Jackett as the discovery source, then returns `[RD+]` for file selections successfully resolved during the last five days and `[RD download]` for unknown results. Selecting an unknown result adds the magnet to Real-Debrid, selects the matching file, and shows a downloading status; select it again after the transfer finishes. Successful playback redirects Stremio to the unrestricted Real-Debrid URL.

Real-Debrid no longer provides a reliable global instant-availability lookup to addons, so `RD+` is intentionally learned from successful resolutions rather than guessed. Enable `INCLUDE_P2P_FALLBACK=true` to keep a `[P2P]` copy available when RD rejects or cannot process a release. Tokens placed in configured manifest URLs are Base64-encoded, not encrypted; environment configuration is safer for a personal deployment.

For TV episode searches, the addon uses Jackett/Torznab `tvsearch` with season and episode parameters, then validates release titles locally. This keeps Russian trackers that need `tvsearch` while rejecting fuzzy matches from indexers that return the right episode number for the wrong show.

## Maintenance

- Use `.env.example` as the template for your local `.env`.
- Use `npm run docker:up` to rebuild and start the addon.
- Use `npm run docker:logs` to inspect the active runtime.
- Keep the runtime container labeled for Watchtower updates.

Supporting project docs:

- [ROADMAP.md](ROADMAP.md)
- [STATUS.md](STATUS.md)
- [MAINTENANCE.md](MAINTENANCE.md)

### Install Jackett

- [Install Jackett on Windows](https://github.com/Jackett/Jackett#installation-on-windows)
- [Install Jackett on OSX](https://github.com/Jackett/Jackett#installation-on-macos)
- [Install Jackett on Linux](https://github.com/Jackett/Jackett#installation-on-linux)
- [Install Jackett using Docker](https://github.com/Jackett/Jackett?tab=readme-ov-file#installation-using-docker)

### Setup Jackett

1. Open your web browser and navigate to `http://{{ YOUR LAN IP }}:9117/`. Replace `{{ YOUR LAN IP }}` with your local network IP address.

2. Click on "+ Add Indexer" to add as many indexers as you require.

3. Locate the "API Key" in the top-right corner of the Jackett menu. Copy the text from the input field.

4. Configure the indexers according to your preferences.

5. Once you have completed the above steps, update the ENV variables `JACKETT_HOSTS` and `JACKETT_APIKEYS` to match your container's host configuration.

Remember that the indexer's responsiveness can significantly impact the time it takes to retrieve results for users, so consider this when configuring your setup.

### Add Jackett Add-on to Stremio

Add `http://{{ YOUR IP }}:7000/manifest.json`. Replace `{{ YOUR IP }}` with your LAN IP.

### ToDo

- Reorg code to avoid iterating through the same data multiple times.
- Add your own trackers config.
- Resolve trackers and add cache for trackers ip addresses instead of sending FQDNs.
- Increase versions of npm modules.
- Update README for better understanding how to install.
