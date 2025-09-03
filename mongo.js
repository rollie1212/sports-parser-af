// check_mongo.js
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGO_URI;

async function run() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    const db = client.db("football-bot"); // создадим базу с таким названием
    const collections = await db.listCollections().toArray();

    console.log("📂 Collections:", collections.map(c => c.name));

    // тестовый insert
    const testCol = db.collection("test");
    await testCol.insertOne({ msg: "Hello from Footroll Bot", createdAt: new Date() });

    const doc = await testCol.findOne({});
    console.log("📄 Sample doc:", doc);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await client.close();
  }
}

run();
