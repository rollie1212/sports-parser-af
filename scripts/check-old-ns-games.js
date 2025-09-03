import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

// Load environment variables
config();

async function checkOldNSGames() {
  try {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    
    const db = client.db("football-bot");
    const fixtures = db.collection("fixtures");
    
    const now = Date.now();
    const OLD_NS_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
    const VERY_OLD_NS_THRESHOLD = 48 * 60 * 60 * 1000; // 48 hours
    
    console.log('🔍 Checking for old NS games...');
    console.log(`Current time: ${new Date(now).toISOString()}`);
    console.log(`24h threshold: ${new Date(now - OLD_NS_THRESHOLD).toISOString()}`);
    console.log(`48h threshold: ${new Date(now - VERY_OLD_NS_THRESHOLD).toISOString()}`);
    
    // Find all NS games
    const allNSGames = await fixtures.find({ status: "NS" }).toArray();
    console.log(`\n📊 Total NS games in database: ${allNSGames.length}`);
    
    if (allNSGames.length > 0) {
      console.log('\n📋 All NS games:');
      for (const game of allNSGames) {
        const gameAge = now - game.startTs;
        const ageHours = Math.round(gameAge / (60 * 60 * 1000));
        const ageDays = Math.round(gameAge / (24 * 60 * 60 * 1000));
        
        console.log(`  🏟️ ${game.home} vs ${game.away}`);
        console.log(`     ID: ${game.fixtureId}`);
        console.log(`     Date: ${game.date}`);
        console.log(`     Age: ${ageHours} hours (${ageDays} days)`);
        console.log(`     Should be: ${ageHours > 48 ? 'CANCELLED' : ageHours > 24 ? 'POSTPONED' : 'OK'}`);
        console.log('');
      }
    }
    
    // Find old NS games that should be closed
    const oldNSGames = await fixtures.find({
      status: "NS",
      startTs: { $lt: now - OLD_NS_THRESHOLD }
    }).toArray();
    
    console.log(`\n🔄 Old NS games (>24h): ${oldNSGames.length}`);
    
    if (oldNSGames.length > 0) {
      console.log('\n⚠️ Games that should be closed:');
      for (const game of oldNSGames) {
        const gameAge = now - game.startTs;
        const ageHours = Math.round(gameAge / (60 * 60 * 1000));
        const ageDays = Math.round(gameAge / (24 * 60 * 60 * 1000));
        
        console.log(`  🚫 ${game.home} vs ${game.away} (${ageHours}h old)`);
        console.log(`     ID: ${game.fixtureId}`);
        console.log(`     Date: ${game.date}`);
        console.log(`     Recommended action: ${ageHours > 48 ? 'Mark as CANCELLED' : 'Mark as POSTPONED'}`);
        console.log('');
      }
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkOldNSGames();
