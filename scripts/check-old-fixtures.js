import { dbConnect } from '../lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkOldFixtures() {
  try {
    await dbConnect();
    const { fixturesCol } = await import('../lib/db.js');
    const fixtures = await fixturesCol();
    
    console.log('🔍 Проверяем старые завершенные игры...');
    
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Ищем завершенные игры старше 24 часов
    const oldFinishedFixtures = await fixtures.find({
      status: { $in: ['FT', 'AET', 'PEN'] },
      finishedAt: { $lt: oneDayAgo }
    }).toArray();
    
    console.log(`📊 Найдено ${oldFinishedFixtures.length} старых завершенных игр:`);
    
    if (oldFinishedFixtures.length > 0) {
      oldFinishedFixtures.slice(0, 10).forEach((fixture, i) => {
        const age = Math.round((now - fixture.finishedAt) / (60 * 60 * 1000));
        console.log(`${i + 1}. ID: ${fixture.fixtureId} | ${fixture.home} vs ${fixture.away} | Возраст: ${age}ч | finishedAt: ${fixture.finishedAt}`);
      });
      
      if (oldFinishedFixtures.length > 10) {
        console.log(`... и еще ${oldFinishedFixtures.length - 10} игр`);
      }
    }
    
    // Проверяем общее количество завершенных игр
    const totalFinished = await fixtures.countDocuments({
      status: { $in: ['FT', 'AET', 'PEN'] }
    });
    
    console.log(`\n📊 Всего завершенных игр: ${totalFinished}`);
    
    // Проверяем игры без finishedAt
    const finishedWithoutDate = await fixtures.countDocuments({
      status: { $in: ['FT', 'AET', 'PEN'] },
      finishedAt: { $exists: false }
    });
    
    console.log(`📊 Завершенных игр БЕЗ finishedAt: ${finishedWithoutDate}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

checkOldFixtures();
