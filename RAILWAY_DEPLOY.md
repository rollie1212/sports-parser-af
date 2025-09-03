# Railway Deployment Guide

## 🚀 Деплой Sports Parser AF на Railway

### Шаг 1: Подготовка GitHub репозитория

1. Создайте репозиторий на GitHub:
   - Название: `sports-parser-af`
   - Описание: `Automated football fixtures parser from API-Football with MongoDB storage and TTL cleanup`
   - Публичный репозиторий
   - Без README, .gitignore, лицензии

2. Добавьте remote и отправьте код:
```bash
git remote add origin https://github.com/YOUR_USERNAME/sports-parser-af.git
git push -u origin master
```

### Шаг 2: Настройка Railway

1. Перейдите на [railway.app](https://railway.app)
2. Войдите через GitHub
3. Нажмите "New Project"
4. Выберите "Deploy from GitHub repo"
5. Выберите репозиторий `sports-parser-af`

### Шаг 3: Настройка переменных окружения

В Railway Dashboard → Variables добавьте:

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/football-bot
API_KEY=your_api_football_key_here
FETCH_INTERVAL_MINUTES=1
DAYS_AHEAD=5
```

**Важно:**
- `PORT` Railway установит автоматически
- `MONGO_URI` должен быть строкой подключения к MongoDB Atlas или другому облачному MongoDB
- `API_KEY` получите на [api-sports.io](https://api-sports.io/)

### Шаг 4: Настройка MongoDB

#### Вариант A: MongoDB Atlas (Рекомендуется)
1. Создайте аккаунт на [mongodb.com/atlas](https://mongodb.com/atlas)
2. Создайте кластер (бесплатный M0)
3. Создайте пользователя базы данных
4. Добавьте IP адрес Railway в whitelist (0.0.0.0/0 для всех)
5. Получите connection string

#### Вариант B: Railway MongoDB
1. В Railway Dashboard добавьте MongoDB service
2. Railway автоматически создаст `MONGO_URI`

### Шаг 5: Деплой

1. Railway автоматически задеплоит проект
2. Проверьте логи в Railway Dashboard
3. Убедитесь, что парсер запустился без ошибок

### Шаг 6: Мониторинг

#### Health Check
```bash
curl https://your-app-name.railway.app/health
```

#### Логи
- Railway Dashboard → Deployments → View Logs
- Ищите сообщения:
  - `✅ Mongo connected`
  - `🚀 Parser running`
  - `✅ Updated total X fixtures`

### Шаг 7: Настройка домена (опционально)

1. Railway Dashboard → Settings → Domains
2. Добавьте custom domain
3. Настройте DNS записи

## 🔧 Troubleshooting

### Проблема: MongoDB connection failed
**Решение:**
- Проверьте `MONGO_URI`
- Убедитесь, что IP адрес в whitelist
- Проверьте username/password

### Проблема: API key invalid
**Решение:**
- Проверьте `API_KEY`
- Убедитесь, что ключ активен на api-sports.io

### Проблема: App crashes on startup
**Решение:**
- Проверьте логи в Railway Dashboard
- Убедитесь, что все переменные окружения установлены
- Проверьте синтаксис в server.js

### Проблема: No fixtures being fetched
**Решение:**
- Проверьте `API_KEY` и лимиты API
- Увеличьте `DAYS_AHEAD` если нужно
- Проверьте логи на ошибки API

## 📊 Мониторинг производительности

### Railway Metrics
- CPU usage
- Memory usage
- Network traffic
- Response times

### Application Metrics
- Fixtures updated per cycle
- API response times
- Database operation times
- Error rates

## 🔄 Обновления

Для обновления приложения:
1. Внесите изменения в код
2. Сделайте commit и push в GitHub
3. Railway автоматически задеплоит новую версию

```bash
git add .
git commit -m "Update: description of changes"
git push origin master
```

## 💰 Стоимость

- **Railway**: Бесплатно до 500 часов в месяц
- **MongoDB Atlas**: Бесплатно до 512MB
- **API-Football**: Зависит от плана

## 🆘 Поддержка

- Railway Docs: [docs.railway.app](https://docs.railway.app)
- MongoDB Atlas Docs: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)
- API-Football Docs: [api-sports.io/documentation](https://api-sports.io/documentation)
