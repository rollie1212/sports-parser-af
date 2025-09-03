import { dbConnect } from '../lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function syncThreadScore() {
  try {
    await dbConnect();
    const { threadsCol, fixturesCol } = await import('../lib/db.js');
    const threads = await threadsCol();
    const fixtures = await fixturesCol();
    
    console.log('🔧 Синхронизируем счет в треде с правильным счетом из fixtures...');
    
    // Получаем правильный счет из fixtures
    const fixture = await fixtures.findOne({ fixtureId: 1386587 });
    if (!fixture) {
      console.log('❌ Fixture 1386587 не найден');
      return;
    }
    
    console.log('📊 Правильный счет из fixtures:', JSON.stringify(fixture.score));
    
    // Обновляем счет в треде
    const result = await threads.updateOne(
      { fixtureId: 1386587 },
      {
        $set: {
          currentScore: fixture.score,
          finalScore: fixture.score,
          lastScoreUpdate: new Date(),
          lastStatusUpdate: new Date()
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log('✅ Счет в треде обновлен!');
      
      // Проверяем результат
      const updatedThread = await threads.findOne({ fixtureId: 1386587 });
      console.log('\n📊 Обновленный тред:');
      console.log('⚽ currentScore:', JSON.stringify(updatedThread.currentScore));
      console.log('⚽ finalScore:', JSON.stringify(updatedThread.finalScore));
      console.log('📝 resultPosted:', updatedThread.resultPosted);
      console.log('📝 discordResultPosted:', updatedThread.discordResultPosted);
      
      console.log('\n🎯 Теперь бот должен постить правильные результаты!');
    } else {
      console.log('⚠️ Тред не был изменен');
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

syncThreadScore();
