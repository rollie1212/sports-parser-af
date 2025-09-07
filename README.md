# Sports Parser AF

Автоматический парсер футбольных матчей из API-Football с сохранением в MongoDB и автоматической очисткой старых данных.

## 🚀 Возможности

- **Автоматический парсинг** матчей каждую минуту
- **TTL индексы** для автоматического удаления старых игр
- **Умная обработка статусов** (NS → POSTPONED → CANCELLED)
- **REST API** для получения данных
- **Автоматическая очистка** старых игр
- **Поддержка симуляций** (не перезаписывает симулированные данные)
- **🖼️ BunnyCDN интеграция** для оптимизации изображений
- **⚡ Оптимизированные изображения** команд, лиг, игроков
- **🌍 Глобальная доставка** контента через CDN

## 📋 Требования

- Node.js 18+
- MongoDB
- API-Football ключ

## ⚙️ Установка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/yourusername/sports-parser-af.git
cd sports-parser-af
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте `.env` файл:
```env
MONGO_URI=mongodb://localhost:27017/football-bot
API_KEY=your_api_football_key
PORT=3000
FETCH_INTERVAL_MINUTES=1
DAYS_AHEAD=5

# BunnyCDN Configuration (Optional)
ENABLE_BUNNY_CDN=false
BUNNY_CDN_URL=https://your-pull-zone.b-cdn.net
```

4. Запустите парсер:
```bash
npm start
```

## 🔧 API Endpoints

### Health Check
```
GET /health
```
Возвращает статус сервера.

### Upcoming Fixtures
```
GET /fixtures/upcoming
```
Возвращает предстоящие матчи (NS, LIVE статусы).

### Manual Fixture Update
```
GET /fixtures/update/:fixtureId
```
Принудительно обновляет конкретный матч из API.

### Image Optimization Endpoints
```
GET /images/team/:teamId?width=100&height=100&quality=85
GET /images/league/:leagueId?width=80&height=80&quality=85
GET /images/player/:playerId?width=150&height=150&quality=85
GET /images/venue/:venueId?width=300&height=200&quality=85
GET /images/country/:countryCode?width=40&height=30&quality=85
GET /images/status
```
Оптимизированные изображения через BunnyCDN.

## 🗄️ База данных

### Коллекция: fixtures

```javascript
{
  fixtureId: Number,        // ID матча из API
  league: String,           // Название лиги
  country: String,          // Страна
  home: String,             // Домашняя команда
  away: String,             // Гостевая команда
  date: String,             // ISO дата матча
  startTs: Number,          // Timestamp начала
  status: String,           // NS, LIVE, FT, CANCELLED, POSTPONED
  score: {
    home: Number,           // Голы домашней команды
    away: Number            // Голы гостевой команды
  },
  rawStatus: Object,        // Оригинальный статус из API
  finishedAt: Date,         // Время окончания (для TTL)
  updatedAt: Date,          // Время последнего обновления
  simulated: Boolean,       // Флаг симуляции
  closeReason: String,      // Причина закрытия
  cleanupReason: String,    // Причина очистки
  images: {                 // Оптимизированные изображения
    homeTeamLogo: String,   // Логотип домашней команды
    awayTeamLogo: String,   // Логотип гостевой команды
    leagueLogo: String,     // Логотип лиги
    countryFlag: String,    // Флаг страны
    venueImage: String      // Изображение стадиона
  }
}
```

### Индексы

- `{ fixtureId: 1 }` - уникальный индекс
- `{ startTs: 1 }` - для сортировки по времени
- `{ status: 1 }` - для фильтрации по статусу
- `{ finishedAt: 1 }` - TTL индекс (24 часа)

## 🧹 Автоматическая очистка

### TTL (Time To Live)
- **FT игры**: удаляются через 24 часа после окончания
- **CANCELLED игры**: удаляются через 24 часа после `startTs`
- **POSTPONED игры**: удаляются через 24 часа после `startTs`

### Логика закрытия NS игр
- **24-48 часов**: помечаются как `POSTPONED`
- **Старше 48 часов**: помечаются как `CANCELLED`

### Скрипты очистки
```bash
# Анализ и очистка старых игр
node scripts/cleanup-old-games.js
```

## 🚀 Деплой на Railway

1. Подключите GitHub репозиторий к Railway
2. Установите переменные окружения:
   - `MONGO_URI` - строка подключения к MongoDB
   - `API_KEY` - ключ API-Football
   - `PORT` - порт (Railway автоматически)
   - `FETCH_INTERVAL_MINUTES` - интервал обновления
   - `DAYS_AHEAD` - количество дней вперед

3. Railway автоматически задеплоит и запустит парсер

## 📊 Мониторинг

Парсер логирует:
- Количество обновленных матчей
- Закрытые старые NS игры
- Очищенные старые игры
- Ошибки API и базы данных

## 🔄 Цикл работы

1. **Каждую минуту**:
   - Получает матчи на ближайшие дни
   - Обновляет существующие матчи
   - Закрывает старые NS игры
   - Очищает старые завершенные игры

2. **TTL автоматически** удаляет старые игры через 24 часа

## 🖼️ BunnyCDN Integration

Для оптимизации изображений через BunnyCDN:

1. **Настройка BunnyCDN**: Следуйте инструкциям в [BUNNY_CDN_SETUP.md](./BUNNY_CDN_SETUP.md)
2. **Тестирование**: `npm run test:bunnycdn`
3. **Мониторинг**: `GET /images/status`

### Преимущества BunnyCDN:
- ⚡ **60-80% меньше размер файлов** (WebP оптимизация)
- 🌍 **Глобальная доставка** через CDN
- 💰 **Снижение затрат** на bandwidth
- 🚀 **Быстрая загрузка** изображений

## 🛠️ Разработка

```bash
# Запуск в режиме разработки
npm run dev

# Запуск оптимизированной версии
npm run dev:optimized

# Проверка старых игр
node scripts/cleanup-old-games.js

# Тестирование BunnyCDN
npm run test:bunnycdn

# Проверка здоровья
curl http://localhost:3000/health
```

## 📝 Лицензия

MIT License
