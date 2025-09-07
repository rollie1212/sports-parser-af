# BunnyCDN Integration Guide for Sports Parser

This guide explains how to set up and use BunnyCDN with your sports parser for optimized image delivery from API-SPORTS.

## Overview

BunnyCDN integration provides:
- **Faster image loading** through global CDN
- **Automatic image optimization** (WebP conversion, compression)
- **Reduced bandwidth costs** for your application
- **Better user experience** with cached images
- **Fallback support** to original API-SPORTS URLs

## Setup Instructions

### 1. Create BunnyCDN Account

1. Visit [BunnyCDN](https://bunny.net/) and create an account
2. Navigate to the dashboard and click on **CDN**
3. Click **Add Pull Zone**

### 2. Configure Pull Zone

#### Basic Configuration
- **Name**: `sports-media-api` (or your preferred name)
- **Origin URL**: `https://media.api-sports.io/`
- **Default URL**: `https://sports-media-api.b-cdn.net`

#### Pricing Plan Selection
Choose between:
- **Standard Tier**: Region-based pricing, can enable/disable specific regions
- **High Volume Tier**: Fixed pricing, more cost-effective for high traffic

### 3. Configure Caching

1. Go to **Caching** section in your pull zone
2. Set **Cache Expiration Time**: `3 days` (recommended for sports images)
3. Set **Browser Cache Expiration Time**: `3 days`

### 4. Configure CORS Headers

1. Go to **Headers** section
2. Add CORS headers:
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, HEAD, OPTIONS
   Access-Control-Allow-Headers: Content-Type
   ```

### 5. Environment Configuration

Add these variables to your `.env` file or Railway environment:

```bash
# BunnyCDN Configuration
ENABLE_BUNNY_CDN=true
BUNNY_CDN_URL=https://your-pull-zone.b-cdn.net
```

## API Endpoints

### Image Optimization Endpoints

#### Get Team Logo
```http
GET /images/team/{teamId}?width=100&height=100&quality=85&format=webp
```

**Example:**
```bash
curl "http://localhost:3000/images/team/33?width=150&height=150&quality=90"
```

**Response:**
```json
{
  "teamId": 33,
  "logoUrl": "https://sports-media-api.b-cdn.net/football/teams/33.png?width=150&height=150&quality=90&format=webp",
  "options": {
    "width": 150,
    "height": 150,
    "quality": 90
  }
}
```

#### Get League Logo
```http
GET /images/league/{leagueId}?width=80&height=80&quality=85&format=webp
```

#### Get Player Photo
```http
GET /images/player/{playerId}?width=150&height=150&quality=85&format=webp
```

#### Get Stadium Image
```http
GET /images/venue/{venueId}?width=300&height=200&quality=85&format=webp
```

#### Get Country Flag
```http
GET /images/country/{countryCode}?width=40&height=30&quality=85&format=webp
```

**Example:**
```bash
curl "http://localhost:3000/images/country/US?width=60&height=40"
```

### Service Status
```http
GET /images/status
```

**Response:**
```json
{
  "bunnyCDNEnabled": true,
  "cdnUrl": "https://sports-media-api.b-cdn.net",
  "originalApiUrl": "https://media.api-sports.io",
  "connectivity": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Enhanced Fixture Data

All fixtures now include optimized image URLs:

```json
{
  "fixtureId": 12345,
  "home": "Manchester United",
  "away": "Liverpool",
  "league": "Premier League",
  "country": "England",
  "images": {
    "homeTeamLogo": "https://sports-media-api.b-cdn.net/football/teams/33.png?width=100&height=100&quality=85&format=webp",
    "awayTeamLogo": "https://sports-media-api.b-cdn.net/football/teams/40.png?width=100&height=100&quality=85&format=webp",
    "leagueLogo": "https://sports-media-api.b-cdn.net/football/leagues/39.png?width=80&height=80&quality=85&format=webp",
    "countryFlag": "https://sports-media-api.b-cdn.net/football/flags/gb.png?width=40&height=30&quality=85&format=webp",
    "venueImage": "https://sports-media-api.b-cdn.net/football/venues/55.png?width=300&height=200&quality=85&format=webp"
  }
}
```

## Image Optimization Parameters

| Parameter | Description | Default | Example |
|-----------|-------------|---------|---------|
| `width` | Image width in pixels | 200 | `150` |
| `height` | Image height in pixels | 200 | `150` |
| `quality` | JPEG/WebP quality (1-100) | 85 | `90` |
| `format` | Output format | `webp` | `jpeg`, `png`, `webp` |

## Usage Examples

### Frontend Integration

```javascript
// Get team logo with custom size
const teamLogoUrl = `http://localhost:3000/images/team/33?width=120&height=120&quality=90`;

// Use in React component
<img 
  src={teamLogoUrl} 
  alt="Team Logo" 
  width="120" 
  height="120"
  loading="lazy"
/>
```

### Direct CDN Usage

```javascript
// Direct BunnyCDN URL (bypasses API)
const directUrl = "https://sports-media-api.b-cdn.net/football/teams/33.png?width=100&height=100&format=webp";
```

## Performance Benefits

### Before BunnyCDN
- Images served from `media.api-sports.io`
- No optimization
- Slower loading times
- Higher bandwidth usage

### After BunnyCDN
- Images served from global CDN
- Automatic WebP conversion
- 60-80% smaller file sizes
- Faster loading times
- Reduced bandwidth costs

## Monitoring and Analytics

### BunnyCDN Dashboard
- Monitor bandwidth usage
- View cache hit rates
- Track performance metrics
- Analyze geographic distribution

### API Status Endpoint
```bash
curl http://localhost:3000/images/status
```

## Troubleshooting

### Common Issues

1. **Images not loading**
   - Check BunnyCDN connectivity: `GET /images/status`
   - Verify pull zone configuration
   - Ensure CORS headers are set

2. **Slow image loading**
   - Check cache hit rates in BunnyCDN dashboard
   - Verify pull zone is active
   - Consider enabling more regions

3. **High bandwidth costs**
   - Monitor usage in BunnyCDN dashboard
   - Optimize image parameters (reduce quality/size)
   - Consider High Volume tier for large traffic

### Fallback Behavior

If BunnyCDN is disabled or unavailable, the service automatically falls back to original API-SPORTS URLs:

```javascript
// When ENABLE_BUNNY_CDN=false
const logoUrl = "https://media.api-sports.io/football/teams/33.png";
```

## Cost Optimization Tips

1. **Choose appropriate pricing tier**
   - Standard: For moderate traffic with regional control
   - High Volume: For high traffic with fixed pricing

2. **Optimize image parameters**
   - Use WebP format for better compression
   - Adjust quality based on use case
   - Resize images to required dimensions

3. **Monitor usage**
   - Set up alerts in BunnyCDN dashboard
   - Track bandwidth consumption
   - Optimize cache settings

## Security Considerations

1. **CORS Configuration**
   - Restrict origins if needed
   - Use specific domains instead of `*`

2. **Access Control**
   - Consider authentication for sensitive images
   - Implement rate limiting if necessary

3. **HTTPS**
   - Always use HTTPS for image URLs
   - Ensure SSL certificates are valid

## Migration Guide

### From Direct API-SPORTS URLs

**Before:**
```javascript
const logoUrl = "https://media.api-sports.io/football/teams/33.png";
```

**After:**
```javascript
const logoUrl = "http://localhost:3000/images/team/33?width=100&height=100";
```

### Database Migration

If you have existing fixture data without images, the service will automatically add image URLs on the next update cycle.

## Support

- **BunnyCDN Documentation**: https://support.bunny.net/
- **API-SPORTS Documentation**: https://www.api-sports.io/documentation
- **Project Issues**: Create an issue in the project repository

## Changelog

### v1.0.0
- Initial BunnyCDN integration
- Image optimization service
- Enhanced fixture data with image URLs
- API endpoints for image optimization
- Fallback support for original URLs
