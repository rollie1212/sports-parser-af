import { dbConnect } from '../lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

const MAX_GAME_DURATION_HOURS = 3; // Максимальная длительность игры в часах

async function autoCloseOldGames() {
  try {
    await dbConnect();
    const { fixturesCol } = await import('../lib/db.js');
    const fixtures = await fixturesCol();
    
    console.log('🔄 Автоматическое закрытие старых игр...');
    console.log(`⏰ Максимальная длительность игры: ${MAX_GAME_DURATION_HOURS} часа`);
    
    const now = Date.now();
    const maxGameDuration = MAX_GAME_DURATION_HOURS * 60 * 60 * 1000; // в миллисекундах
    
    // Находим все LIVE игры
    const liveGames = await fixtures.find({ status: 'LIVE' }).toArray();
    console.log(`📊 Найдено ${liveGames.length} LIVE игр`);
    
    let closedCount = 0;
    let skippedCount = 0;
    
    for (const game of liveGames) {
      try {
        // Проверяем, есть ли startTs
        if (!game.startTs) {
          console.log(`  ⚠️ Игра ${game.fixtureId} (${game.home} vs ${game.away}) - нет startTs, пропускаем`);
          skippedCount++;
          continue;
        }
        
        // Проверяем возраст игры
        const gameStartTime = typeof game.startTs === 'number' ? game.startTs : new Date(game.startTs).getTime();
        const gameAge = now - gameStartTime;
        
        if (gameAge > maxGameDuration) {
          // Игра идет слишком долго, закрываем её
          console.log(`  🔴 Закрываем игру ${game.fixtureId} (${game.home} vs ${game.away})`);
          console.log(`     - Возраст: ${Math.round(gameAge / (60 * 60 * 1000))}ч`);
          console.log(`     - Началась: ${new Date(gameStartTime).toISOString()}`);
          
          // Если есть счет, используем его, иначе ставим 0:0
          const finalScore = game.score && game.score.home !== null && game.score.away !== null 
            ? game.score 
            : { home: 0, away: 0 };
          
          // Обновляем статус игры
          await fixtures.updateOne(
            { fixtureId: game.fixtureId },
            {
              $set: {
                status: 'FT',
                score: finalScore,
                finishedAt: new Date(),
                autoClosed: true,
                autoClosedAt: new Date(),
                autoClosedReason: `Автоматически закрыта после ${MAX_GAME_DURATION_HOURS} часов`
              }
            }
          );
          
          console.log(`     ✅ Статус изменен на FT, счет: ${finalScore.home}:${finalScore.away}`);
          closedCount++;
          
        } else {
          // Игра еще идет нормально
          const remainingTime = maxGameDuration - gameAge;
          console.log(`  🟢 Игра ${game.fixtureId} (${game.home} vs ${game.away}) - еще идет, осталось ${Math.round(remainingTime / (60 * 1000))} мин`);
          skippedCount++;
        }
        
      } catch (error) {
        console.error(`  ❌ Ошибка при обработке игры ${game.fixtureId}:`, error);
        skippedCount++;
      }
    }
    
    console.log('\n📊 РЕЗУЛЬТАТЫ:');
    console.log(`  - Всего LIVE игр: ${liveGames.length}`);
    console.log(`  - Автоматически закрыто: ${closedCount}`);
    console.log(`  - Пропущено: ${skippedCount}`);
    
    if (closedCount > 0) {
      console.log('\n💡 Закрытые игры теперь будут обработаны ботом:');
      console.log(`   1. Бот найдет их в finalizeFinishedGames()`);
      console.log(`   2. Результаты будут поститься в Discord`);
      console.log(`   3. Через 24 часа TTL индекс удалит их из базы`);
    }
    
    return { closedCount, skippedCount };
    
  } catch (error) {
    console.error('❌ Ошибка во время автоматического закрытия игр:', error);
    throw error;
  }
}

// Если скрипт запущен напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  autoCloseOldGames().then((result) => {
    console.log('\n🏁 Скрипт завершен успешно');
    process.exit(0);
  }).catch(error => {
    console.error('\n💥 Скрипт завершился с ошибкой:', error);
    process.exit(1);
  });
}

export { autoCloseOldGames };
