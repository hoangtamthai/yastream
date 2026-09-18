# v0.11.0 2026-09-18

- Change: migrate database from libsql (Turso) to PostgreSQL
  - Drizzle dialect: sqlite -> postgresql, driver: @libsql/client -> pg (node-postgres)
  - Epoch-ms timestamps now use bigint
  - Legacy DATABASE_WRITE_TOKEN / DATABASE_READ_TOKEN env vars are ignored
  - One-time data migration script: scripts/migrate-libsql-to-pg.mjs

# v0.10.0 2026-07-21

- Add: match ignore words (remove uncut, uncut version)
- Update: nsfw ids

# v0.10.0 2026-07-20

- Add: proxy from webshare for better rate limit
- Change: migrate to libsql database for synchronized storage
- Update: nsfw ids

# v0.9.3 2026-06-07

- Remove: mkvdrama search, only serve from database
- Change: only saved encrypted subtitle to DB
- Change: single source of default config

# v0.9.2 2026-06-03

- Add: Proxy for kisskh encrypted subtitle (env PROXY_URL, PROXY_KISSKH_SUBTITLE) and tmdb (env PROXY_TMDB)
- Add: Use flaresolverr to get cookies bypass for kisskh (env KISSKH_USE_FLARESOLVERR)
- Update: nsfw ids
- Fix: subtitle content-type
- Fix: length show correct time

# v0.9.1 2026-05-30

- Add: ntfy have priority
- Fix: subtitle show more reliable

# v0.9.0 2026-05-23

- Add TorBox integration for DDL stream:
  - Sometimes file may not be available or deleted from hoster, check from mkvdrama again to make sure
  - Cached stream: [TB+]
  - Not cached stream [TB] click will download stream to TorBox if hoster file is available with no password
- Add Mediaflow-proxy integration for stream from Send.now
- Mkvdrama:
  - Support most flow to get streams (ouo/direct -> viewcrate/filecrypt -> pixeldrain/send/mega/gofile)
  - Password protected content not yet implemented
  - Add size to stream
  - Some episode may be in wrong order (dcrypt.it get the wrong episodes order from dlc, let me know to fix it)
- Kisskh:
  - Default timeout to 7 seconds with 2 retry

# v0.8.0 2026-05-10

- Add mkvdrama, only support ouo -> viewcrate -> pixeldrain flow
- Add job queue for long task like mkvdrama
- Add some testing for request flow
- Add cache control for public page
- Fix season to get right stream
- Add prometheus metrics

# v0.7.3 2026-05-05

- Get best link from onetouchtv for stream if there are multiple links
- Use imdb id for poster if available
- Show rate limit on stream list if got rate limit from provider
- Switch from title (deprecated) to description for stream
- TMDB: Use append response for less requests

# v0.7.2 2026-05-02

- Use rose quartz color for accent in landing page
- Use database for all streams/subtitles if found
- Log less error, mainly for unknown error
- Fix stuck when fail to probe stream info

# v0.7.1 2026-04-26

- Default RPDB poster to rounded blocks
- Improve admin dashboard with more metrics
- Rotate different sites for availability with metrics-based selection
- Limit delete kv table

# v0.7.0 2026-04-24

- Add api for get streams and subtitles from db
- Add database kv cleaning periodly with DATABASE_CLEAN_KV_MINUTES
- Add unique to subtitle contraint
- Restructure source code (service, router, controller)
- Store resolution, size and duration to streams db
- Fix save playlist to db, only store unique playlist

# v0.6.1 2026-04-23

- Make database optional
- Adjust rate limit, add config to env

# v0.6.0 2026-04-22

- Add sqlite database for long storage
- Check and show rate limit for each resource

# v0.5.0 2026-04-19

- Add logo to README.md
- Add label to subtitle to known which provider it from
- Support aiostream format for title
- Add retry logic if got rate limit (too many request)
  1. Up to RETRY_TIMEOUT_MS
  2. Delay after RETRY_DELAY_MS with exponential backup
  3. Add RETRY_JITTER_MS for offset retry
- Each provider has different rate limit client
- Add cicd workflows
- Show current online users at configure page
- Fix: remove duplicate catalogs
- Fix: show all language subtitle for onetouch

# v0.4.1 2026-04-15

- Stream cache to 1 hour from 2 hours

# v0.4.0 2026-04-14

- Improve UI-UX of configure/landing page
- Choose custom poster from multiple providers
- Can set sites to fetch (in case got blocked)
- Adjust: rate limit to 40 request per minute
- Fix: episode 0 for some show

# v0.3.1 2026-03-29

- Improve caching and error handling
- Update healthcheck, less aggressive
- Update analytic to know if there is bottleneck or DOS
- Add rate limit per ip and for external request
- Rotate different sites for availability
- Show episode 0 if have
- Add warm cache for popular catalogs
- Fix: client cache for all resource route

# v0.3.0 2026-03-07

- Add onetouchtv to provider list for catalog and stream
- Support autoplay from same stream in series
- Migrate to new stremio-addon/sdk

# v0.2.5 2026-03-03

- Support rpdb poster, add fallback poster if not found
- Finding stream for kkphim and ophim more reliable
- Clean up source, add zod to type check

# v0.2.4 2026-03-01

- Add Vietnamese providers:
  1. kkphim (sometimes has AD, need Vietnamese VPN/Mediaflow-proxy)
  2. ophim
- Add some filter and display options
  1. Hide/Show nsfw content (if missing please report in discord)
  2. Hide/Show detail stream information (slower results when enabled)

# v0.2.3 2026-02-26

- Add cache size to env
- Add catalog selections

# v0.2.2 2026-02-25

- Improve caching mechanism, cache each url
- Add link to reddit and discord

# v0.2.1 2026-02-24

- Add tvdb search fallback to search with both main title and alt title | Thanks kodan2k
- Change poster shape to regular
- Add info to stream (duration, size, resolution)

# v0.2.0 2026-02-23

## Feature

- Migrate to Hono server
- Add configure page to select providers to use
- Add new provider idrama (suggested by a user)
- Add some catalogs for kisskh (no searching): New, Korean, and Chinese
- Add support for fallback search | Thanks [Historicalect62](https://www.reddit.com/r/StremioAddons/comments/1r36zji/comment/o5r5me7/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button), [zirotaz](https://www.reddit.com/r/StremioAddons/comments/1r36zji/comment/o5gycmo/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
  1. Search with TMDB id if available
  2. Search with TVDB id if available

## Fix

- If the show appear on search, it should return | Thanks [kodan2k](https://www.reddit.com/r/StremioAddons/comments/1r36zji/comment/o5iwc7a/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)

# v0.1.6 2026-02-14

- Support encrypted subtitles

# v0.1.5

- Support subtitles for all devices with subtitle route
- Caching to reduce requests and improve performance

# v0.1.4

- Have subtitles for some devices with subtitles in stream route

# v0.1.3

- Improve title ranking system to get best title

# v0.1.2

- Switch to typescript

# v0.1.1

- Load stream from kisskh

# v0.1.0

- Connect to TMDB for title using IMDB id
