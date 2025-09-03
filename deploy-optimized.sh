#!/bin/bash

# Deploy Optimized Sports Parser to Railway
echo "🚀 Deploying Optimized Sports Parser to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "🔐 Logging in to Railway..."
railway login

# Create new project or use existing
echo "📦 Creating Railway project..."
railway init

# Set environment variables
echo "⚙️ Setting environment variables..."
railway variables set FETCH_INTERVAL_MINUTES=5
railway variables set DAYS_AHEAD=3
railway variables set BATCH_SIZE=50
railway variables set CACHE_TTL_MINUTES=10
railway variables set NODE_OPTIONS="--max-old-space-size=256"

# Deploy
echo "🚀 Deploying to Railway..."
railway up

# Get deployment URL
echo "🌐 Getting deployment URL..."
railway domain

echo "✅ Deployment complete!"
echo "📊 Monitor your app at: https://railway.app/dashboard"
echo "🔍 Check logs with: railway logs"
echo "🏥 Health check: curl https://your-app.railway.app/health"
