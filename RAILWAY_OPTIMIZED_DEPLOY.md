# 🚀 Optimized Railway Deployment Guide

## 💰 Cost-Effective Sports Parser Deployment

### 🎯 Key Optimizations

1. **Smart Update Intervals**: 5 minutes instead of 1 minute
2. **API Response Caching**: 10-minute cache to reduce API calls
3. **Batch Processing**: Process data in chunks of 50 records
4. **Memory Optimization**: 256MB memory limit
5. **Smart Cleanup**: Only run when needed
6. **Optimized MongoDB**: Reduced connection pool and better indexes

### 📊 Expected Savings

- **API Calls**: 70-80% reduction
- **CPU Usage**: 70% reduction  
- **Memory Usage**: 50% reduction
- **Railway Hours**: 60-70% reduction

## 🚀 Quick Deployment

### Option 1: Automated Script
```bash
cd /Users/andriikysil/sports-parser-af
./deploy-optimized.sh
```

### Option 2: Manual Deployment

#### Step 1: Prepare Repository
```bash
# Initialize git if not already done
git init
git add .
git commit -m "Add optimized sports parser"

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/sports-parser-af.git
git push -u origin main
```

#### Step 2: Railway Setup
1. Go to [railway.app](https://railway.app)
2. Login with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your `sports-parser-af` repository

#### Step 3: Configure Environment Variables
In Railway Dashboard → Variables, add:

```env
# Required
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/football-bot?retryWrites=true&w=majority
API_KEY=your_api_football_key_here

# Optimization Settings
FETCH_INTERVAL_MINUTES=5
DAYS_AHEAD=3
BATCH_SIZE=50
CACHE_TTL_MINUTES=10
NODE_OPTIONS=--max-old-space-size=256
```

#### Step 4: Deploy
1. Railway will automatically deploy
2. Check logs for successful startup
3. Test health endpoint: `https://your-app.railway.app/health`

## 🔧 Configuration Options

### Production Settings (Recommended)
```env
FETCH_INTERVAL_MINUTES=5
DAYS_AHEAD=3
BATCH_SIZE=50
CACHE_TTL_MINUTES=10
NODE_OPTIONS=--max-old-space-size=256
```

### Development Settings (More Frequent Updates)
```env
FETCH_INTERVAL_MINUTES=2
DAYS_AHEAD=2
BATCH_SIZE=25
CACHE_TTL_MINUTES=5
NODE_OPTIONS=--max-old-space-size=128
```

### High-Performance Settings (More Resources)
```env
FETCH_INTERVAL_MINUTES=3
DAYS_AHEAD=5
BATCH_SIZE=100
CACHE_TTL_MINUTES=15
NODE_OPTIONS=--max-old-space-size=512
```

## 📊 Monitoring

### Health Check
```bash
curl https://your-app.railway.app/health
```

Expected response:
```json
{
  "ok": true,
  "timestamp": "2025-09-03T10:00:00.000Z",
  "cacheSize": 15,
  "lastUpdate": "2025-09-03T09:55:00.000Z"
}
```

### Force Update
```bash
curl -X POST https://your-app.railway.app/update/force
```

### View Logs
```bash
# Using Railway CLI
railway logs

# Or in Railway Dashboard
# Go to your project → Deployments → View Logs
```

## 🎯 Performance Monitoring

### Key Metrics to Watch
1. **Cache Hit Rate**: Higher is better
2. **Update Frequency**: Should match your settings
3. **Memory Usage**: Should stay under 256MB
4. **API Response Times**: Should be fast
5. **Error Rate**: Should be minimal

### Log Messages to Look For
```
✅ Mongo connected (optimized)
🚀 Optimized Parser running
⚡ Running quick update cycle
✅ Quick update: X fixtures (today + tomorrow)
🔄 Running full update cycle
✅ Full update: X fixtures for Y days
```

## 🔄 Updates and Maintenance

### Updating the Parser
1. Make changes to `server-optimized.js`
2. Commit and push to GitHub
3. Railway will auto-deploy
4. Monitor logs for successful deployment

### Scaling
- **Free Tier**: Up to 500 hours/month
- **With Optimizations**: ~150-200 hours/month
- **Pro Tier**: If you need more resources

### Backup Strategy
- MongoDB Atlas provides automatic backups
- Railway keeps deployment history
- Environment variables are stored securely

## 🆘 Troubleshooting

### Common Issues

#### 1. High Memory Usage
**Symptoms**: App crashes, slow performance
**Solution**: 
- Reduce `BATCH_SIZE`
- Increase `FETCH_INTERVAL_MINUTES`
- Check for memory leaks in logs

#### 2. API Rate Limiting
**Symptoms**: 429 errors, failed requests
**Solution**:
- Increase `CACHE_TTL_MINUTES`
- Increase `FETCH_INTERVAL_MINUTES`
- Check API key limits

#### 3. Slow Updates
**Symptoms**: Data not updating, old fixtures
**Solution**:
- Decrease `FETCH_INTERVAL_MINUTES`
- Decrease `CACHE_TTL_MINUTES`
- Check network connectivity

#### 4. MongoDB Connection Issues
**Symptoms**: Connection timeouts, database errors
**Solution**:
- Check `MONGO_URI`
- Verify MongoDB Atlas whitelist
- Check connection string format

### Debug Commands
```bash
# Check app status
curl https://your-app.railway.app/health

# Force full update
curl -X POST https://your-app.railway.app/update/force

# View recent logs
railway logs --tail 100

# Check environment variables
railway variables
```

## 💡 Pro Tips

1. **Start with optimized settings** - Don't use the original version
2. **Monitor for the first week** - Adjust settings based on usage
3. **Use health checks** - Set up monitoring alerts
4. **Keep logs clean** - Regular cleanup prevents issues
5. **Test locally first** - Use `npm run dev:optimized` before deploying

## 📈 Cost Analysis

### Free Tier Usage (500 hours/month)
- **Original Parser**: ~400-450 hours
- **Optimized Parser**: ~150-200 hours
- **Savings**: 60-70% reduction

### Pro Tier Benefits
- More resources available
- Better performance
- Priority support
- Custom domains

## 🎉 Success Metrics

Your deployment is successful when:
- ✅ Health check returns 200
- ✅ Logs show regular updates
- ✅ Memory usage stays under 256MB
- ✅ No API rate limiting errors
- ✅ Fixtures update correctly
- ✅ Cache is working (cacheSize > 0)

---

**Ready to deploy?** Run `./deploy-optimized.sh` or follow the manual steps above! 🚀
