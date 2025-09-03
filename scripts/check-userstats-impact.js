import { dbConnect } from '../lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkUserStatsImpact() {
  try {
    await dbConnect();
    const { predictionsCol, threadsCol } = await import('../lib/db.js');
    const predictions = await predictionsCol();
    const threads = await threadsCol();
    
    console.log('🔍 Проверяем влияние изменения счета на userStats...');
    
    // Находим игру Leicester vs Birmingham
    const thread = await threads.findOne({ fixtureId: 1386587 });
    if (!thread) {
      console.log('❌ Тред не найден');
      return;
    }
    
    console.log('📊 Игра:', thread.title);
    console.log('⚽ Финальный счет:', JSON.stringify(thread.finalScore));
    
    // Получаем все предсказания для этой игры
    const gamePredictions = await predictions.find({ threadId: thread.threadId }).toArray();
    console.log(`📝 Всего предсказаний: ${gamePredictions.length}`);
    
    // Считаем правильные предсказания со старым счетом (1:0)
    const oldCorrectPredictions = gamePredictions.filter(p => 
      p.scoreHome === 1 && p.scoreAway === 0
    );
    
    // Считаем правильные предсказания с новым счетом (2:0)
    const newCorrectPredictions = gamePredictions.filter(p => 
      p.scoreHome === 2 && p.scoreAway === 0
    );
    
    console.log('\n📊 Анализ предсказаний:');
    console.log(`  - Правильных для счета 1:0: ${oldCorrectPredictions.length}`);
    console.log(`  - Правильных для счета 2:0: ${newCorrectPredictions.length}`);
    
    if (oldCorrectPredictions.length !== newCorrectPredictions.length) {
      console.log('\n⚠️  ВНИМАНИЕ: userStats нужно обновить!');
      console.log('   - Количество правильных предсказаний изменилось');
      console.log('   - Точность пользователей изменилась');
      console.log('   - Нужно запустить !admin update-stats');
    } else {
      console.log('\n✅ userStats не изменились');
    }
    
    // Показываем примеры пользователей, чья статистика изменилась
    if (oldCorrectPredictions.length !== newCorrectPredictions.length) {
      console.log('\n👥 Пользователи, чья статистика изменилась:');
      
      const oldUserIds = new Set(oldCorrectPredictions.map(p => p.userId));
      const newUserIds = new Set(newCorrectPredictions.map(p => p.userId));
      
      // Пользователи, которые были правильными для 1:0, но не для 2:0
      const lostCorrect = Array.from(oldUserIds).filter(id => !newUserIds.has(id));
      if (lostCorrect.length > 0) {
        console.log(`  ❌ Потеряли правильность (${lostCorrect.length}):`);
        lostCorrect.slice(0, 5).forEach(id => console.log(`    - ${id}`));
      }
      
      // Пользователи, которые стали правильными для 2:0
      const gainedCorrect = Array.from(newUserIds).filter(id => !oldUserIds.has(id));
      if (gainedCorrect.length > 0) {
        console.log(`  ✅ Получили правильность (${gainedCorrect.length}):`);
        gainedCorrect.slice(0, 5).forEach(id => console.log(`    - ${id}`));
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

checkUserStatsImpact();
