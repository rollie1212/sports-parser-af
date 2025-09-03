import { dbConnect } from '../lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkDuplicates() {
  try {
    await dbConnect();
    const { predictionsCol } = await import('../lib/db.js');
    const preds = await predictionsCol();
    
    // Получаем последние 20 предсказаний
    const recentPredictions = await preds.find({}).sort({timestamp: -1}).limit(20).toArray();
    
    console.log('📊 Последние 20 предсказаний:');
    console.log('='.repeat(80));
    
    recentPredictions.forEach((pred, index) => {
      console.log(`${index + 1}. Thread: ${pred.threadId.slice(-8)} | User: ${pred.username} | Score: ${pred.scoreHome}:${pred.scoreAway} | Time: ${pred.timestamp.toISOString()}`);
    });
    
    // Проверяем дубли по threadId + userId
    console.log('\n🔍 Проверяем дубли по threadId + userId:');
    console.log('='.repeat(80));
    
    const duplicates = await preds.aggregate([
      {
        $group: {
          _id: { threadId: '$threadId', userId: '$userId' },
          count: { $sum: 1 },
          predictions: { $push: { score: { $concat: ['$scoreHome', ':', '$scoreAway'] }, timestamp: '$timestamp', id: '$_id' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).toArray();
    
    if (duplicates.length === 0) {
      console.log('✅ Дубли не найдены!');
    } else {
      console.log(`❌ Найдено ${duplicates.length} дублей:`);
      duplicates.forEach((dup, index) => {
        console.log(`\n${index + 1}. Thread: ${dup._id.threadId.slice(-8)} | User: ${dup._id.userId.slice(-8)} | Count: ${dup.count}`);
        dup.predictions.forEach(pred => {
          console.log(`   - Score: ${pred.score} | Time: ${pred.timestamp} | ID: ${pred.id}`);
        });
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

checkDuplicates();
