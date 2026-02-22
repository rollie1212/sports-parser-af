// server.js
import express from "express";
import axios from "axios";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import imageService from "./lib/image-service.js";
import { createLiveEventsTracker } from "./lib/live-events-tracker.js";
import {
  createLeagueIdMatcher,
  parseLeagueIdAllowlist,
} from "./lib/competition-scope.js";
dotenv.config();

/** ---------- ENV ---------- */
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const API_KEY = process.env.API_KEY; // API-Football
const API_URL = "https://v3.football.api-sports.io/fixtures";

// простые настройки
const FETCH_INTERVAL_MINUTES = parseInt(process.env.FETCH_INTERVAL_MINUTES || "1", 10); // 1 минута
const DAYS_AHEAD = parseInt(process.env.DAYS_AHEAD || "2", 10);
const LIVE_EVENTS_LEAGUE_IDS = parseLeagueIdAllowlist(
  process.env.LIVE_EVENTS_LEAGUE_IDS
);

if (!MONGO_URI || !API_KEY) {
  console.error("❌ Missing MONGO_URI or API_KEY in .env");
  process.exit(1);
}

/** ---------- APP/MONGO ---------- */
const app = express();

// Middleware
app.use(express.json());

const client = new MongoClient(MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 15000,
});

let db, fixtures;
let liveEventsTracker;

function envFlag(value) {
  return String(value || "").toLowerCase() === "true";
}

async function connectMongo() {
  await client.connect();
  db = client.db("football-bot");
  fixtures = db.collection("fixtures");

  // Индексы
  await fixtures.createIndex({ fixtureId: 1 }, { unique: true });
  await fixtures.createIndex({ startTs: 1 });
  await fixtures.createIndex({ status: 1 });

  // TTL: удалить документ через 24ч после finishedAt
  await fixtures.createIndex(
    { finishedAt: 1 },
    { expireAfterSeconds: 24 * 60 * 60 }
  );

  console.log("✅ Mongo connected (football-bot.fixtures)");
}

/** ---------- UTILS ---------- */
function normStatus(short) {
  if (["NS"].includes(short)) return "NS";
  if (["1H", "HT", "2H", "ET", "BT", "P"].includes(short)) return "LIVE";
  if (["FT", "AET", "PEN"].includes(short)) return "FT";
  if (["PST", "CANC", "ABD", "AWD", "WO"].includes(short)) return "CANCELLED";
  return short || "UNK";
}

function ymdOffset(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Check and close old NS games that should have started
async function closeOldNSGames() {
  try {
    const now = Date.now();
    const OLD_NS_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
    
    // Find NS games that are older than 24 hours
    const oldNSGames = await fixtures.find({
      status: "NS",
      startTs: { $lt: now - OLD_NS_THRESHOLD }
    }).toArray();
    
    if (oldNSGames.length > 0) {
      console.log(`🔄 Found ${oldNSGames.length} old NS games to close`);
      
      for (const game of oldNSGames) {
        // Mark as cancelled if it's very old (more than 48 hours)
        const gameAge = now - game.startTs;
        const isVeryOld = gameAge > 48 * 60 * 60 * 1000;
        
        const newStatus = isVeryOld ? "CANCELLED" : "POSTPONED";
        
        await fixtures.updateOne(
          { fixtureId: game.fixtureId },
          {
            $set: {
              status: newStatus,
              updatedAt: new Date(),
              finishedAt: new Date(game.startTs), // Use original start time
              closeReason: isVeryOld ? "Game too old, likely cancelled" : "Game delayed, likely postponed"
            }
          }
        );
        
        console.log(`  ✅ Marked ${game.home} vs ${game.away} as ${newStatus}`);
      }
    }
  } catch (error) {
    console.error("❌ Error closing old NS games:", error);
  }
}

// Clean up old POSTPONED and CANCELLED games that don't have finishedAt
async function cleanupOldFinishedGames() {
  try {
    const now = Date.now();
    const OLD_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Find old POSTPONED/CANCELLED games without finishedAt
    const oldFinishedGames = await fixtures.find({
      status: { $in: ["POSTPONED", "CANCELLED"] },
      startTs: { $lt: now - OLD_THRESHOLD },
      $or: [
        { finishedAt: { $exists: false } },
        { finishedAt: null }
      ]
    }).toArray();
    
    if (oldFinishedGames.length > 0) {
      console.log(`🧹 Found ${oldFinishedGames.length} old finished games to clean up`);
      
      for (const game of oldFinishedGames) {
        await fixtures.updateOne(
          { fixtureId: game.fixtureId },
          {
            $set: {
              finishedAt: new Date(game.startTs),
              updatedAt: new Date(),
              cleanupReason: "Added finishedAt for TTL cleanup"
            }
          }
        );
        
        console.log(`  ✅ Added finishedAt to ${game.home} vs ${game.away} (${game.status})`);
      }
    }
  } catch (error) {
    console.error("❌ Error cleaning up old finished games:", error);
  }
}

/** ---------- FETCH & UPSERT ---------- */
async function fetchAndUpsertByDate(dateStr) {
  try {
    const { data } = await axios.get(API_URL, {
      headers: { "x-apisports-key": API_KEY },
      params: { date: dateStr, timezone: "Europe/Prague" },
      timeout: 15000,
    });

    const list = Array.isArray(data?.response) ? data.response : [];
    if (!list.length) {
      console.log(`⚠️ No fixtures from API for ${dateStr}`, data?.errors || "");
      return 0;
    }

    let count = 0;
    for (const f of list) {
      const startIso = f?.fixture?.date;
      const startTs = startIso ? new Date(startIso).getTime() : null;
      const status = normStatus(f?.fixture?.status?.short);

      const baseDoc = {
        fixtureId: f?.fixture?.id,
        league: f?.league?.name || "",
        country: f?.league?.country || "",
        home: f?.teams?.home?.name || "",
        away: f?.teams?.away?.name || "",
        date: startIso || null,
        startTs,
        status,
        score: {
          home: Number.isInteger(f?.goals?.home) ? f.goals.home : null,
          away: Number.isInteger(f?.goals?.away) ? f.goals.away : null,
        },
        rawStatus: f?.fixture?.status || null,
        updatedAt: new Date(),
        // Enhanced with image URLs
        images: {
          homeTeamLogo: imageService.getTeamLogo(f?.teams?.home?.id),
          awayTeamLogo: imageService.getTeamLogo(f?.teams?.away?.id),
          leagueLogo: imageService.getLeagueLogo(f?.league?.id),
          countryFlag: imageService.getCountryFlag(f?.league?.country),
          venueImage: imageService.getStadiumImage(f?.fixture?.venue?.id)
        }
      };

      if (!baseDoc.fixtureId || !baseDoc.startTs) continue;

      // TTL helper
      const setOps = { ...baseDoc };
      const unsetOps = {};
      if (status === "FT") {
        setOps.finishedAt = new Date();
      } else if (status === "CANCELLED" || status === "POSTPONED") {
        setOps.finishedAt = new Date(startTs);
      } else {
        unsetOps.finishedAt = "";
      }

      // Check if fixture is simulated - don't overwrite simulated data
      const existingFixture = await fixtures.findOne({ fixtureId: baseDoc.fixtureId });
      
      if (existingFixture?.simulated) {
        console.log(`⚠️ Skipping update for simulated fixture ${baseDoc.fixtureId}`);
        continue;
      }

      await fixtures.updateOne(
        { fixtureId: baseDoc.fixtureId },
        Object.keys(unsetOps).length
          ? { $set: setOps, $unset: unsetOps }
          : { $set: setOps },
        { upsert: true }
      );
      count++;
    }

    return count;
  } catch (error) {
    if (error.response) {
      console.error(`❌ API Error for ${dateStr}: ${error.response.status} - ${error.response.statusText}`);
      if (error.response.status === 503) {
        console.log(`⚠️ Service temporarily unavailable for ${dateStr}, will retry later`);
      }
    } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      console.error(`❌ Connection error for ${dateStr}: ${error.message}`);
    } else {
      console.error(`❌ Error fetching fixtures for ${dateStr}:`, error.message);
    }
    return 0;
  }
}

/** ---------- ENDPOINTS ---------- */
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/fixtures/upcoming", async (_req, res) => {
  const now = Date.now();
  const horizon = (DAYS_AHEAD + 1) * 24 * 60 * 60 * 1000; // сегодня + DAYS_AHEAD
  const docs = await fixtures
    .find({
      status: { $in: ["NS", "LIVE"] },
      startTs: { $gte: now - 5 * 60 * 1000, $lte: now + horizon },
    })
    .sort({ startTs: 1 })
    .toArray();

  res.json(docs);
});

// Notify bot about fixture updates
app.post("/fixtures/notify", async (req, res) => {
  try {
    const { fixtureId, oldStatus, newStatus, oldScore, newScore } = req.body;
    
    if (!fixtureId) {
      return res.status(400).json({ error: "fixtureId is required" });
    }
    
    console.log(`📢 Notification request for fixture ${fixtureId}: ${oldStatus} → ${newStatus}`);
    
    // Here you would send notification to Discord bot
    // For now, we'll just log it
    console.log(`   Old: ${oldStatus} (${oldScore ? `${oldScore.home}-${oldScore.away}` : 'N/A'})`);
    console.log(`   New: ${newStatus} (${newScore ? `${newScore.home}-${newScore.away}` : 'N/A'})`);
    
    res.json({
      success: true,
      message: "Notification processed",
      fixtureId,
      oldStatus,
      newStatus
    });
    
  } catch (error) {
    console.error("❌ Error processing notification:", error);
    res.status(500).json({ error: error.message });
  }
});

// Manual update for specific fixture
app.get("/fixtures/update/:fixtureId", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId);
    
    if (!fixtureId) {
      return res.status(400).json({ error: "Invalid fixture ID" });
    }
    
    console.log(`🔄 Manual update requested for fixture ${fixtureId}`);
    
    // Fetch latest data from API
    const { data } = await axios.get(API_URL, {
      headers: { "x-apisports-key": API_KEY },
      params: { id: fixtureId },
      timeout: 10000,
    });
    
    if (!data?.response?.[0]) {
      return res.status(404).json({ error: "Fixture not found in API" });
    }
    
    const apiGame = data.response[0];
    const apiScore = apiGame.goals;
    const apiStatus = apiGame.fixture.status.short;
    const apiRawStatus = apiGame.fixture.status;
    
    // Get current data from database
    const currentGame = await fixtures.findOne({ fixtureId });
    
    if (!currentGame) {
      return res.status(404).json({ error: "Fixture not found in database" });
    }
    
    // Update the game
    const result = await fixtures.updateOne(
      { fixtureId },
      {
        $set: {
          score: {
            home: Number.isInteger(apiScore?.home) ? apiScore.home : null,
            away: Number.isInteger(apiScore?.away) ? apiScore.away : null,
          },
          status: normStatus(apiStatus),
          rawStatus: apiRawStatus,
          updatedAt: new Date(),
          finishedAt: normStatus(apiStatus) === "FT" ? new Date() : currentGame.finishedAt
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`✅ Manual update successful for fixture ${fixtureId}`);
      res.json({
        success: true,
        message: "Fixture updated successfully",
        fixtureId,
        oldScore: currentGame.score,
        newScore: { home: apiScore?.home, away: apiScore?.away },
        oldStatus: currentGame.status,
        newStatus: normStatus(apiStatus)
      });
    } else {
      res.json({
        success: true,
        message: "Fixture already up to date",
        fixtureId,
        score: { home: apiScore?.home, away: apiScore?.away },
        status: normStatus(apiStatus)
      });
    }
    
  } catch (error) {
    console.error("❌ Error in manual fixture update:", error);
    res.status(500).json({ error: error.message });
  }
});

// Image optimization endpoints
app.get("/images/team/:teamId", (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const { width, height, quality, format } = req.query;
    
    if (!teamId) {
      return res.status(400).json({ error: "Invalid team ID" });
    }
    
    const options = {};
    if (width) options.width = parseInt(width);
    if (height) options.height = parseInt(height);
    if (quality) options.quality = parseInt(quality);
    if (format) options.format = format;
    
    const logoUrl = imageService.getTeamLogo(teamId, options);
    
    res.json({
      teamId,
      logoUrl,
      options: options
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/images/league/:leagueId", (req, res) => {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const { width, height, quality, format } = req.query;
    
    if (!leagueId) {
      return res.status(400).json({ error: "Invalid league ID" });
    }
    
    const options = {};
    if (width) options.width = parseInt(width);
    if (height) options.height = parseInt(height);
    if (quality) options.quality = parseInt(quality);
    if (format) options.format = format;
    
    const logoUrl = imageService.getLeagueLogo(leagueId, options);
    
    res.json({
      leagueId,
      logoUrl,
      options: options
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/images/status", async (_req, res) => {
  try {
    const stats = imageService.getStats();
    const connectivity = await imageService.testConnectivity();
    
    res.json({
      ...stats,
      connectivity,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/events/live/poll", async (_req, res) => {
  if (!liveEventsTracker) {
    return res.status(503).json({ error: "Live events tracker is not initialized" });
  }

  const result = await liveEventsTracker.pollOnce();
  res.json(result);
});

app.post("/telegram/webhook", async (req, res) => {
  if (!liveEventsTracker) {
    return res.status(503).json({ error: "Live events tracker is not initialized" });
  }
  const result = await liveEventsTracker.handleTelegramUpdate(req.body);
  res.json(result);
});

/** ---------- UPDATE LOOP (ПРОСТАЯ ЛОГИКА) ---------- */
async function updateCycle() {
  try {
    const days = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => i); // 0..DAYS_AHEAD
    let total = 0;
    
    for (const off of days) {
      const d = ymdOffset(off);
      const n = await fetchAndUpsertByDate(d);
      total += n;
    }
    
    // Close old NS games that should have started
    await closeOldNSGames();
    
    // Clean up old finished games that don't have finishedAt
    await cleanupOldFinishedGames();
    
    console.log(`✅ Updated total ${total} fixtures for days ${days.join(", ")}`);
    
  } catch (error) {
    console.error("❌ Error in update cycle:", error);
  }
}

/** ---------- START ---------- */
app.listen(PORT, async () => {
  try {
    await connectMongo();
    const liveEventsEnabled = envFlag(process.env.ENABLE_LIVE_EVENTS_TRACKER);
    if (liveEventsEnabled && LIVE_EVENTS_LEAGUE_IDS.size === 0) {
      console.log(
        "⚠️ Live events tracker requested but LIVE_EVENTS_LEAGUE_IDS is empty. Tracker will stay disabled."
      );
    }
    liveEventsTracker = createLiveEventsTracker({
      db,
      apiKey: API_KEY,
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
      enabled: liveEventsEnabled && LIVE_EVENTS_LEAGUE_IDS.size > 0,
      shouldTrackFixture: createLeagueIdMatcher(LIVE_EVENTS_LEAGUE_IDS),
      intervalSeconds: process.env.LIVE_EVENTS_INTERVAL_SECONDS || "60",
      timezone: process.env.API_TIMEZONE || "Europe/Prague",
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      ytLookbackHours: process.env.YT_LOOKBACK_HOURS || "6",
      ytMaxResults: process.env.YT_MAX_RESULTS || "10",
      ytCacheMinutes: process.env.YT_CACHE_MINUTES || "10",
    });
    await liveEventsTracker.start();
    console.log(`🚀 Parser running on http://localhost:${PORT}`);
    console.log(`⏰ Update interval: ${FETCH_INTERVAL_MINUTES} minutes`);
    console.log(`📅 Days ahead: ${DAYS_AHEAD}`);

    await updateCycle();                              // первый прогон
    setInterval(updateCycle, FETCH_INTERVAL_MINUTES * 60 * 1000);
  } catch (e) {
    console.error("❌ Startup error:", e);
    process.exit(1);
  }
});

/** ---------- GRACEFUL SHUTDOWN ---------- */
process.on("SIGINT", async () => {
  console.log("👋 Closing Mongo connection...");
  try {
    if (liveEventsTracker) {
      await liveEventsTracker.stop();
    }
    await client.close();
  } finally {
    process.exit(0);
  }
});
