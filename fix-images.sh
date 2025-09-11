#!/bin/bash

echo "🔧 Fixing image service configuration..."

# Set BunnyCDN to disabled
echo "Setting ENABLE_BUNNY_CDN=false"
railway variables --set "ENABLE_BUNNY_CDN=false"

# Set BunnyCDN URL (fallback)
echo "Setting BUNNY_CDN_URL"
railway variables --set "BUNNY_CDN_URL=https://test-media-api-sports.b-cdn.net"

echo "✅ Variables updated. Railway will restart the service automatically."
echo "🔄 Waiting for restart..."

# Wait a bit for restart
sleep 10

echo "🧪 Testing image service..."
curl -s "https://sports-parser-af-production.up.railway.app/images/status"

echo "🧪 Testing team logo..."
curl -s "https://sports-parser-af-production.up.railway.app/images/team/33"

echo "✅ Done! Images should now work with original API-SPORTS URLs."
