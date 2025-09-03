# 🚀 Quick Deploy to Railway

## 1. Create GitHub Repository
```bash
# After creating repo on GitHub, run:
git remote add origin https://github.com/YOUR_USERNAME/sports-parser-af.git
git push -u origin master
```

## 2. Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Login with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select `sports-parser-af` repository

## 3. Set Environment Variables
In Railway Dashboard → Variables, add:

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/football-bot
API_KEY=your_api_football_key_here
FETCH_INTERVAL_MINUTES=1
DAYS_AHEAD=5
```

## 4. Setup MongoDB
- **Option A**: Use MongoDB Atlas (free tier)
- **Option B**: Add MongoDB service in Railway

## 5. Deploy & Monitor
- Railway auto-deploys on push
- Check logs in Railway Dashboard
- Test: `curl https://your-app.railway.app/health`

## ✅ Done!
Your parser will now run 24/7 on Railway! 🎉
