// server-optimized.js - Cost-effective version for Railway
import express from "express";
import axios from "axios";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import imageService from "./lib/image-service.js";
dotenv.config();

/** ---------- ENV ---------- */
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const API_KEY = process.env.API_KEY;
const API_BASE = "https://api-football-v1.p.rapidapi.com/v3";

// Optimized settings for cost reduction
const FETCH_INTERVAL_MINUTES = parseInt(process.env.FETCH_INTERVAL_MINUTES || "60", 10); // 60 minutes for full updates
const THREADS_UPDATE_INTERVAL = parseInt(process.env.THREADS_UPDATE_INTERVAL || "2", 10); // 2 minutes for threaded updates
const DAYS_AHEAD = parseInt(process.env.DAYS_AHEAD || "5", 10); // 5 days ahead
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "30", 10); // Process in batches
const CACHE_TTL_MINUTES = parseInt(process.env.CACHE_TTL_MINUTES || "5", 10); // Cache API responses

if (!MONGO_URI || !API_KEY) {
  console.error("❌ Missing MONGO_URI or API_KEY in .env");
  process.exit(1);
}

/** ---------- APP/MONGO ---------- */
const app = express();
app.use(express.json());

// Optimized MongoDB connection
const client = new MongoClient(MONGO_URI, {
  maxPoolSize: 5, // Reduced from 10
  serverSelectionTimeoutMS: 10000, // Reduced from 15000
  socketTimeoutMS: 30000, // Reduced from default
  connectTimeoutMS: 10000,
  retryWrites: true,
  w: 'majority'
});

let db, fixtures, threads;
let lastUpdateTime = 0;
let apiCache = new Map();

async function connectMongo() {
  await client.connect();
  db = client.db("football-bot");
  fixtures = db.collection("fixtures");
  threads = db.collection("threads");

  // Optimized indexes
  await fixtures.createIndex({ fixtureId: 1 }, { unique: true });
  await fixtures.createIndex({ startTs: 1, status: 1 }); // Compound index
  await fixtures.createIndex({ status: 1, startTs: 1 }); // For cleanup queries
  await fixtures.createIndex({ updatedAt: 1 }); // For tracking updates
  
  // Threads indexes for hybrid updates
  await threads.createIndex({ fixtureId: 1 });
  await threads.createIndex({ closed: 1, fixtureId: 1 });

  // TTL: удалить документ через 24ч после finishedAt
  await fixtures.createIndex(
    { finishedAt: 1 },
    { expireAfterSeconds: 24 * 60 * 60 }
  );

  console.log("✅ Mongo connected (optimized)");
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
  return d.toISOString().slice(0, 10);
}

// Smart cache for API responses
function getCachedResponse(key) {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MINUTES * 60 * 1000) {
    return cached.data;
  }
  return null;
}

function setCachedResponse(key, data) {
  apiCache.set(key, {
    data,
    timestamp: Date.now()
  });
  
  // Clean old cache entries
  if (apiCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of apiCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MINUTES * 60 * 1000) {
        apiCache.delete(k);
      }
    }
  }
}

// Optimized cleanup - only run when needed
async function smartCleanup() {
  try {
    const now = Date.now();
    const OLD_NS_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
    const OLD_FINISHED_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Batch cleanup operations
    const [oldNSGames, oldFinishedGames] = await Promise.all([
      fixtures.find({
        status: "NS",
        startTs: { $lt: now - OLD_NS_THRESHOLD }
      }).limit(100).toArray(), // Limit to prevent memory issues
      
      fixtures.find({
        status: { $in: ["POSTPONED", "CANCELLED"] },
        startTs: { $lt: now - OLD_FINISHED_THRESHOLD },
        $or: [
          { finishedAt: { $exists: false } },
          { finishedAt: null }
        ]
      }).limit(100).toArray()
    ]);
    
    // Process in batches
    if (oldNSGames.length > 0) {
      console.log(`🔄 Processing ${oldNSGames.length} old NS games`);
      
      const bulkOps = oldNSGames.map(game => {
        const gameAge = now - game.startTs;
        const isVeryOld = gameAge > 48 * 60 * 60 * 1000;
        const newStatus = isVeryOld ? "CANCELLED" : "POSTPONED";
        
        return {
          updateOne: {
            filter: { fixtureId: game.fixtureId },
            update: {
              $set: {
                status: newStatus,
                updatedAt: new Date(),
                finishedAt: new Date(game.startTs),
                closeReason: isVeryOld ? "Game too old, likely cancelled" : "Game delayed, likely postponed"
              }
            }
          }
        };
      });
      
      await fixtures.bulkWrite(bulkOps);
      console.log(`  ✅ Updated ${oldNSGames.length} NS games`);
    }
    
    if (oldFinishedGames.length > 0) {
      console.log(`🧹 Processing ${oldFinishedGames.length} old finished games`);
      
      const bulkOps = oldFinishedGames.map(game => ({
        updateOne: {
          filter: { fixtureId: game.fixtureId },
          update: {
            $set: {
              finishedAt: new Date(game.startTs),
              updatedAt: new Date(),
              cleanupReason: "Added finishedAt for TTL cleanup"
            }
          }
        }
      }));
      
      await fixtures.bulkWrite(bulkOps);
      console.log(`  ✅ Updated ${oldFinishedGames.length} finished games`);
    }
    
  } catch (error) {
    console.error("❌ Error in smart cleanup:", error);
  }
}

// Hybrid update: frequent updates for games with active threads
async function updateThreadedFixtures() {
  try {
    console.log("🔄 Starting threaded fixtures update...");
    
    // Get active threads with their fixture IDs
    const activeThreads = await threads.find({ 
      closed: { $ne: true } 
    }).toArray();
    
    if (activeThreads.length === 0) {
      console.log("  ℹ️ No active threads found");
      return;
    }
    
    const fixtureIds = activeThreads.map(t => t.fixtureId);
    console.log(`  📊 Found ${fixtureIds.length} active threads`);
    
    // Get current fixture data from database
    const currentFixtures = await fixtures.find({
      fixtureId: { $in: fixtureIds }
    }).toArray();
    
    if (currentFixtures.length === 0) {
      console.log("  ℹ️ No fixtures found for active threads");
      return;
    }
    
    // Process in batches
    const batches = [];
    for (let i = 0; i < currentFixtures.length; i += BATCH_SIZE) {
      batches.push(currentFixtures.slice(i, i + BATCH_SIZE));
    }
    
    let totalUpdated = 0;
    
    for (const batch of batches) {
      const fixtureIdsBatch = batch.map(f => f.fixtureId);
      
      // Fetch fresh data from API
      const response = await axios.get("https://v3.football.api-sports.io/fixtures", {
        headers: { "x-apisports-key": API_KEY },
        params: { ids: fixtureIdsBatch.join('-') },
        timeout: 10000
      });
      
      if (response.status !== 200) {
        console.log(`  ⚠️ API error for batch: ${response.status}`);
        continue;
      }
      
      const data = response.data;
      if (!data.response || data.response.length === 0) continue;
      
      // Update fixtures with new data
      const bulkOps = [];
      
      for (const fixture of data.response) {
        const existing = batch.find(f => f.fixtureId === fixture.fixture.id);
        if (!existing) continue;
        
        const newData = {
          ...existing,
          status: fixture.fixture.status.short,
          score: {
            home: fixture.goals.home,
            away: fixture.goals.away
          },
          updatedAt: new Date()
        };
        
        // Check if status or score changed
        const statusChanged = existing.status !== newData.status;
        const scoreChanged = 
          existing.score?.home !== newData.score?.home || 
          existing.score?.away !== newData.score?.away;
        
        if (statusChanged || scoreChanged) {
          bulkOps.push({
            updateOne: {
              filter: { fixtureId: fixture.fixture.id },
              update: { $set: newData }
            }
          });
          totalUpdated++;
          
          console.log(`  🔄 Updated ${fixture.teams.home.name} vs ${fixture.teams.away.name}: ${existing.status} → ${newData.status}`);
        }
      }
      
      if (bulkOps.length > 0) {
        await fixtures.bulkWrite(bulkOps);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`  ✅ Threaded update complete: ${totalUpdated} fixtures updated`);
    
  } catch (error) {
    console.error("❌ Error in threaded fixtures update:", error);
  }
}

/** ---------- OPTIMIZED FETCH & UPSERT ---------- */
async function fetchAndUpsertByDate(dateStr) {
  try {
    // Check cache first
    const cacheKey = `fixtures_${dateStr}`;
    let data = getCachedResponse(cacheKey);
    
    if (!data) {
      const response = await axios.get("https://v3.football.api-sports.io/fixtures", {
        headers: { "x-apisports-key": API_KEY },
        params: { date: dateStr, timezone: "Europe/Prague" },
        timeout: 10000, // Reduced timeout
      });
      
      data = response.data;
      setCachedResponse(cacheKey, data);
    }

    const list = Array.isArray(data?.response) ? data.response : [];
    if (!list.length) {
      console.log(`⚠️ No fixtures from API for ${dateStr}`);
      return 0;
    }

    // Process in batches to reduce memory usage
    let totalUpdated = 0;
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
      const bulkOps = [];
      
      for (const f of batch) {
        const startIso = f?.fixture?.date;
        const startTs = startIso ? new Date(startIso).getTime() : null;
        const status = normStatus(f?.fixture?.status?.short);

        if (!f?.fixture?.id || !startTs) continue;

        const baseDoc = {
          fixtureId: f.fixture.id,
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

        bulkOps.push({
          updateOne: {
            filter: { fixtureId: baseDoc.fixtureId },
            update: Object.keys(unsetOps).length
              ? { $set: setOps, $unset: unsetOps }
              : { $set: setOps },
            upsert: true
          }
        });
      }
      
      if (bulkOps.length > 0) {
        await fixtures.bulkWrite(bulkOps);
        totalUpdated += bulkOps.length;
      }
    }

    return totalUpdated;
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

// Smart update cycle - only update what's needed
async function smartUpdateCycle() {
  try {
    const now = Date.now();
    
    // Only run full update if it's been more than 30 minutes
    const shouldFullUpdate = now - lastUpdateTime > 30 * 60 * 1000;
    
    if (shouldFullUpdate) {
      console.log("🔄 Running full update cycle");
      const days = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => i);
      let total = 0;
      
      for (const off of days) {
        const d = ymdOffset(off);
        const n = await fetchAndUpsertByDate(d);
        total += n;
      }
      
      await smartCleanup();
      lastUpdateTime = now;
      console.log(`✅ Full update: ${total} fixtures for ${days.length} days`);
    } else {
      // Quick update - only today and tomorrow
      console.log("⚡ Running quick update cycle");
      const today = ymdOffset(0);
      const tomorrow = ymdOffset(1);
      
      const [todayCount, tomorrowCount] = await Promise.all([
        fetchAndUpsertByDate(today),
        fetchAndUpsertByDate(tomorrow)
      ]);
      
      console.log(`✅ Quick update: ${todayCount + tomorrowCount} fixtures (today + tomorrow)`);
    }
    
  } catch (error) {
    console.error("❌ Error in smart update cycle:", error);
  }
}

/** ---------- ENDPOINTS ---------- */
app.get("/health", (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    cacheSize: apiCache.size,
    lastUpdate: new Date(lastUpdateTime).toISOString()
  });
});

app.get("/fixtures/upcoming", async (_req, res) => {
  try {
    const now = Date.now();
    const horizon = (DAYS_AHEAD + 1) * 24 * 60 * 60 * 1000;
    
    const docs = await fixtures
      .find({
        status: { $in: ["NS", "LIVE"] },
        startTs: { $gte: now - 5 * 60 * 1000, $lte: now + horizon },
      })
      .sort({ startTs: 1 })
      .limit(100) // Limit results
      .toArray();

    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/fixtures/notify", async (req, res) => {
  try {
    const { fixtureId, oldStatus, newStatus, oldScore, newScore } = req.body;
    
    if (!fixtureId) {
      return res.status(400).json({ error: "fixtureId is required" });
    }
    
    console.log(`📢 Notification: ${fixtureId} ${oldStatus} → ${newStatus}`);
    res.json({ success: true, message: "Notification processed" });
    
  } catch (error) {
    console.error("❌ Error processing notification:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get fixtures for active threads
app.get("/fixtures/threaded", async (_req, res) => {
  try {
    const activeThreads = await threads.find({ 
      closed: { $ne: true } 
    }).toArray();
    
    if (activeThreads.length === 0) {
      return res.json({ fixtures: [] });
    }
    
    const fixtureIds = activeThreads.map(t => t.fixtureId);
    const fixturesData = await fixtures.find({
      fixtureId: { $in: fixtureIds }
    }).toArray();
    
    res.json({ 
      fixtures: fixturesData,
      threadCount: activeThreads.length 
    });
  } catch (error) {
    console.error("❌ Error getting threaded fixtures:", error);
    res.status(500).json({ error: error.message });
  }
});

// Force full update endpoint
app.post("/update/force", async (_req, res) => {
  try {
    lastUpdateTime = 0; // Reset to force full update
    await smartUpdateCycle();
    res.json({ success: true, message: "Full update completed" });
  } catch (error) {
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

app.get("/images/player/:playerId", (req, res) => {
  try {
    const playerId = parseInt(req.params.playerId);
    const { width, height, quality, format } = req.query;
    
    if (!playerId) {
      return res.status(400).json({ error: "Invalid player ID" });
    }
    
    const options = {};
    if (width) options.width = parseInt(width);
    if (height) options.height = parseInt(height);
    if (quality) options.quality = parseInt(quality);
    if (format) options.format = format;
    
    const photoUrl = imageService.getPlayerPhoto(playerId, options);
    
    res.json({
      playerId,
      photoUrl,
      options: options
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/images/venue/:venueId", (req, res) => {
  try {
    const venueId = parseInt(req.params.venueId);
    const { width, height, quality, format } = req.query;
    
    if (!venueId) {
      return res.status(400).json({ error: "Invalid venue ID" });
    }
    
    const options = {};
    if (width) options.width = parseInt(width);
    if (height) options.height = parseInt(height);
    if (quality) options.quality = parseInt(quality);
    if (format) options.format = format;
    
    const imageUrl = imageService.getStadiumImage(venueId, options);
    
    res.json({
      venueId,
      imageUrl,
      options: options
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/images/country/:countryCode", (req, res) => {
  try {
    const countryCode = req.params.countryCode.toUpperCase();
    const { width, height, quality, format } = req.query;
    
    if (!countryCode || countryCode.length !== 2) {
      return res.status(400).json({ error: "Invalid country code (use 2-letter code)" });
    }
    
    const options = {};
    if (width) options.width = parseInt(width);
    if (height) options.height = parseInt(height);
    if (quality) options.quality = parseInt(quality);
    if (format) options.format = format;
    
    const flagUrl = imageService.getCountryFlag(countryCode, options);
    
    res.json({
      countryCode,
      flagUrl,
      options: options
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Image service status and configuration
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

/** ---------- START ---------- */
app.listen(PORT, async () => {
  try {
    await connectMongo();
    console.log(`🚀 Optimized Parser running on http://localhost:${PORT}`);
    console.log(`⏰ Full update interval: ${FETCH_INTERVAL_MINUTES} minutes`);
    console.log(`🔄 Threaded update interval: ${THREADS_UPDATE_INTERVAL} minutes`);
    console.log(`📅 Days ahead: ${DAYS_AHEAD}`);
    console.log(`📦 Batch size: ${BATCH_SIZE}`);
    console.log(`💾 Cache TTL: ${CACHE_TTL_MINUTES} minutes`);

    await smartUpdateCycle();
    setInterval(smartUpdateCycle, FETCH_INTERVAL_MINUTES * 60 * 1000);
    
    // Start threaded fixtures updates (every 2 minutes)
    setInterval(updateThreadedFixtures, THREADS_UPDATE_INTERVAL * 60 * 1000);
  } catch (e) {
    console.error("❌ Startup error:", e);
    process.exit(1);
  }
});

/** ---------- GRACEFUL SHUTDOWN ---------- */
process.on("SIGINT", async () => {
  console.log("👋 Closing connections...");
  try {
    await client.close();
  } finally {
    process.exit(0);
  }
});
