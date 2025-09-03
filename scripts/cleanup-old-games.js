// cleanup-old-games.js
// Script to clean up old games from the database

import dotenv from 'dotenv';
dotenv.config();

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db("football-bot");
    const fixtures = db.collection("fixtures");
    
    console.log("🔍 Analyzing old games in database...");
    
    const now = Date.now();
    const OLD_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Find all old games
    const oldGames = await fixtures.find({
      startTs: { $lt: now - OLD_THRESHOLD }
    }).toArray();
    
    console.log(`📊 Found ${oldGames.length} games older than 7 days`);
    
    // Group by status
    const byStatus = oldGames.reduce((acc, game) => {
      acc[game.status] = (acc[game.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log("📈 Games by status:");
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} games`);
    });
    
    // Find POSTPONED/CANCELLED games without finishedAt
    const unfinishedGames = await fixtures.find({
      status: { $in: ["POSTPONED", "CANCELLED"] },
      startTs: { $lt: now - OLD_THRESHOLD },
      $or: [
        { finishedAt: { $exists: false } },
        { finishedAt: null }
      ]
    }).toArray();
    
    console.log(`\n🧹 Found ${unfinishedGames.length} POSTPONED/CANCELLED games without finishedAt`);
    
    if (unfinishedGames.length > 0) {
      console.log("\n📋 Games to be cleaned up:");
      unfinishedGames.forEach(game => {
        const daysOld = Math.floor((now - game.startTs) / (24 * 60 * 60 * 1000));
        console.log(`  ${game.home} vs ${game.away} (${game.status}) - ${daysOld} days old`);
      });
      
      // Ask for confirmation
      console.log("\n❓ Do you want to add finishedAt to these games? (y/N)");
      
      // For automated execution, we'll proceed
      console.log("🤖 Proceeding with cleanup...");
      
      let cleaned = 0;
      for (const game of unfinishedGames) {
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
        cleaned++;
      }
      
      console.log(`✅ Cleaned up ${cleaned} games`);
    }
    
    // Show TTL statistics
    const ttlGames = await fixtures.find({
      finishedAt: { $exists: true, $ne: null }
    }).toArray();
    
    console.log(`\n⏰ Games with TTL (finishedAt): ${ttlGames.length}`);
    
    const ttlByStatus = ttlGames.reduce((acc, game) => {
      acc[game.status] = (acc[game.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log("📈 TTL games by status:");
    Object.entries(ttlByStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} games`);
    });
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

main();
