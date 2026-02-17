# Senior Review Findings Backlog

Prioritized findings captured for follow-up work:

1. Optimized flow overwrites `simulated` fixtures (`server-optimized.js`), unlike `server.js`.
2. Threaded fixture updates write raw API status and bypass `normStatus`, which can hide live games from `/fixtures/upcoming`.
3. Update intervals run without overlap guards in both server entry points.
4. BunnyCDN is hard-disabled in code (`lib/image-service.js`) regardless of env flags.
5. Multiple ops scripts import missing `lib/db.js` and are currently not executable.

