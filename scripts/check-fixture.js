import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

// Load environment variables
config();

async function checkFixture() {
  try {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    
    const db = client.db("football-bot");
    const fixtures = db.collection("fixtures");
    const threads = db.collection("threads");
    
    const fixtureId = 1391272;
    
    console.log(`🔍 Checking fixture ${fixtureId}...`);
    
    // Check fixture
    const fixture = await fixtures.findOne({ fixtureId });
    if (fixture) {
      console.log('\n📊 FIXTURE DATA:');
      console.log(`ID: ${fixture.fixtureId}`);
      console.log(`Teams: ${fixture.home} vs ${fixture.away}`);
      console.log(`Status: ${fixture.status}`);
      console.log(`Score: ${fixture.score?.home || 'null'}:${fixture.score?.away || 'null'}`);
      console.log(`Date: ${fixture.date}`);
      console.log(`StartTs: ${fixture.startTs}`);
      console.log(`UpdatedAt: ${fixture.updatedAt}`);
      console.log(`FinishedAt: ${fixture.finishedAt || 'NOT SET'}`);
      console.log(`Raw Status:`, fixture.rawStatus);
    } else {
      console.log('❌ Fixture not found in database');
    }
    
    // Check thread
    const thread = await threads.findOne({ fixtureId });
    if (thread) {
      console.log('\n📝 THREAD DATA:');
      console.log(`Thread ID: ${thread.threadId}`);
      console.log(`Title: ${thread.title}`);
      console.log(`Status: ${thread.currentStatus}`);
      console.log(`Score: ${thread.currentScore?.home || 'null'}:${thread.currentScore?.away || 'null'}`);
      console.log(`Closed: ${thread.closed}`);
      console.log(`Result Posted: ${thread.resultPosted}`);
      console.log(`Created At: ${thread.createdAt}`);
    } else {
      console.log('❌ Thread not found in database');
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkFixture();
