// lib/image-service.js - BunnyCDN Image Optimization Service
import axios from 'axios';

/**
 * BunnyCDN Image Service
 * Optimizes image delivery using BunnyCDN pull zones
 * 
 * Features:
 * - Automatic image URL transformation
 * - Fallback to original API-SPORTS URLs
 * - Image optimization parameters
 * - Caching and performance optimization
 */

class ImageService {
  constructor() {
    // BunnyCDN Configuration
    this.bunnyCDNUrl = process.env.BUNNY_CDN_URL || 'https://test-media-api-sports.b-cdn.net';
    this.originalApiUrl = 'https://media.api-sports.io';
    this.enableBunnyCDN = process.env.ENABLE_BUNNY_CDN === 'true';
    
    // Image optimization parameters
    this.defaultParams = {
      width: 200,
      height: 200,
      quality: 85,
      format: 'webp'
    };
    
    console.log(`🖼️ Image Service initialized`);
    console.log(`   BunnyCDN: ${this.enableBunnyCDN ? 'Enabled' : 'Disabled'}`);
    console.log(`   CDN URL: ${this.bunnyCDNUrl}`);
  }

  /**
   * Get optimized image URL for teams, leagues, players, etc.
   * @param {string} originalUrl - Original API-SPORTS image URL
   * @param {Object} options - Optimization options
   * @returns {string} Optimized image URL
   */
  getOptimizedImageUrl(originalUrl, options = {}) {
    if (!originalUrl) return null;
    
    // If BunnyCDN is disabled, return original URL
    if (!this.enableBunnyCDN) {
      return originalUrl;
    }
    
    try {
      // Parse the original URL to extract the path
      const url = new URL(originalUrl);
      const imagePath = url.pathname;
      
      // Build optimized URL with BunnyCDN
      const optimizedUrl = new URL(imagePath, this.bunnyCDNUrl);
      
      // Add optimization parameters
      const params = { ...this.defaultParams, ...options };
      
      // BunnyCDN optimization parameters
      if (params.width) optimizedUrl.searchParams.set('width', params.width);
      if (params.height) optimizedUrl.searchParams.set('height', params.height);
      if (params.quality) optimizedUrl.searchParams.set('quality', params.quality);
      if (params.format) optimizedUrl.searchParams.set('format', params.format);
      
      return optimizedUrl.toString();
    } catch (error) {
      console.warn(`⚠️ Error optimizing image URL: ${originalUrl}`, error.message);
      return originalUrl; // Fallback to original
    }
  }

  /**
   * Get team logo URL
   * @param {number} teamId - Team ID from API-SPORTS
   * @param {Object} options - Image optimization options
   * @returns {string} Optimized team logo URL
   */
  getTeamLogo(teamId, options = {}) {
    if (!teamId) return null;
    
    const originalUrl = `${this.originalApiUrl}/football/teams/${teamId}.png`;
    return this.getOptimizedImageUrl(originalUrl, {
      width: 100,
      height: 100,
      ...options
    });
  }

  /**
   * Get league logo URL
   * @param {number} leagueId - League ID from API-SPORTS
   * @param {Object} options - Image optimization options
   * @returns {string} Optimized league logo URL
   */
  getLeagueLogo(leagueId, options = {}) {
    if (!leagueId) return null;
    
    const originalUrl = `${this.originalApiUrl}/football/leagues/${leagueId}.png`;
    return this.getOptimizedImageUrl(originalUrl, {
      width: 80,
      height: 80,
      ...options
    });
  }

  /**
   * Get player photo URL
   * @param {number} playerId - Player ID from API-SPORTS
   * @param {Object} options - Image optimization options
   * @returns {string} Optimized player photo URL
   */
  getPlayerPhoto(playerId, options = {}) {
    if (!playerId) return null;
    
    const originalUrl = `${this.originalApiUrl}/football/players/${playerId}.png`;
    return this.getOptimizedImageUrl(originalUrl, {
      width: 150,
      height: 150,
      ...options
    });
  }

  /**
   * Get stadium image URL
   * @param {number} venueId - Venue ID from API-SPORTS
   * @param {Object} options - Image optimization options
   * @returns {string} Optimized stadium image URL
   */
  getStadiumImage(venueId, options = {}) {
    if (!venueId) return null;
    
    const originalUrl = `${this.originalApiUrl}/football/venues/${venueId}.png`;
    return this.getOptimizedImageUrl(originalUrl, {
      width: 300,
      height: 200,
      ...options
    });
  }

  /**
   * Get country flag URL
   * @param {string} countryCode - Country code (e.g., 'US', 'GB')
   * @param {Object} options - Image optimization options
   * @returns {string} Optimized country flag URL
   */
  getCountryFlag(countryCode, options = {}) {
    if (!countryCode) return null;
    
    const originalUrl = `${this.originalApiUrl}/football/flags/${countryCode.toLowerCase()}.png`;
    return this.getOptimizedImageUrl(originalUrl, {
      width: 40,
      height: 30,
      ...options
    });
  }

  /**
   * Enhance fixture data with optimized image URLs
   * @param {Object} fixture - Fixture data from API-SPORTS
   * @returns {Object} Enhanced fixture with image URLs
   */
  enhanceFixtureWithImages(fixture) {
    if (!fixture) return fixture;
    
    const enhanced = { ...fixture };
    
    // Add team logos
    if (fixture.teams?.home?.id) {
      enhanced.teams.home.logo = this.getTeamLogo(fixture.teams.home.id);
    }
    if (fixture.teams?.away?.id) {
      enhanced.teams.away.logo = this.getTeamLogo(fixture.teams.away.id);
    }
    
    // Add league logo
    if (fixture.league?.id) {
      enhanced.league.logo = this.getLeagueLogo(fixture.league.id);
    }
    
    // Add country flag
    if (fixture.league?.country) {
      enhanced.league.flag = this.getCountryFlag(fixture.league.country);
    }
    
    // Add venue image
    if (fixture.fixture?.venue?.id) {
      enhanced.fixture.venue.image = this.getStadiumImage(fixture.fixture.venue.id);
    }
    
    return enhanced;
  }

  /**
   * Batch enhance multiple fixtures with images
   * @param {Array} fixtures - Array of fixture data
   * @returns {Array} Array of enhanced fixtures
   */
  enhanceFixturesWithImages(fixtures) {
    if (!Array.isArray(fixtures)) return fixtures;
    
    return fixtures.map(fixture => this.enhanceFixtureWithImages(fixture));
  }

  /**
   * Get image optimization statistics
   * @returns {Object} Statistics about image optimization
   */
  getStats() {
    return {
      bunnyCDNEnabled: this.enableBunnyCDN,
      cdnUrl: this.bunnyCDNUrl,
      originalApiUrl: this.originalApiUrl,
      defaultParams: this.defaultParams
    };
  }

  /**
   * Test BunnyCDN connectivity
   * @returns {Promise<boolean>} True if BunnyCDN is accessible
   */
  async testConnectivity() {
    if (!this.enableBunnyCDN) {
      return false;
    }
    
    try {
      // Test with a simple request to BunnyCDN
      const testUrl = `${this.bunnyCDNUrl}/football/leagues/39.png`;
      const response = await axios.head(testUrl, { timeout: 5000 });
      
      console.log(`✅ BunnyCDN connectivity test: ${response.status}`);
      return response.status === 200;
    } catch (error) {
      console.warn(`⚠️ BunnyCDN connectivity test failed:`, error.message);
      return false;
    }
  }
}

// Export singleton instance
export default new ImageService();
