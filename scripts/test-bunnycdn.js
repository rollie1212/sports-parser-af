#!/usr/bin/env node

// test-bunnycdn.js - Test BunnyCDN integration
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

console.log('🧪 Testing BunnyCDN Integration');
console.log(`📍 Testing against: ${BASE_URL}`);
console.log('');

async function testEndpoint(endpoint, description) {
  try {
    console.log(`🔍 Testing: ${description}`);
    const response = await axios.get(`${BASE_URL}${endpoint}`, { timeout: 10000 });
    
    if (response.status === 200) {
      console.log(`  ✅ Success: ${response.status}`);
      if (response.data) {
        console.log(`  📊 Response:`, JSON.stringify(response.data, null, 2));
      }
    } else {
      console.log(`  ⚠️ Unexpected status: ${response.status}`);
    }
  } catch (error) {
    if (error.response) {
      console.log(`  ❌ Error: ${error.response.status} - ${error.response.statusText}`);
      if (error.response.data) {
        console.log(`  📄 Details:`, error.response.data);
      }
    } else {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
  console.log('');
}

async function runTests() {
  console.log('🚀 Starting BunnyCDN integration tests...\n');
  
  // Test 1: Health check
  await testEndpoint('/health', 'Health Check');
  
  // Test 2: Image service status
  await testEndpoint('/images/status', 'Image Service Status');
  
  // Test 3: Team logo (Manchester United - ID 33)
  await testEndpoint('/images/team/33?width=100&height=100&quality=85', 'Team Logo - Manchester United');
  
  // Test 4: League logo (Premier League - ID 39)
  await testEndpoint('/images/league/39?width=80&height=80&quality=85', 'League Logo - Premier League');
  
  // Test 5: Country flag (England - GB)
  await testEndpoint('/images/country/GB?width=40&height=30&quality=85', 'Country Flag - England');
  
  // Test 6: Player photo (Cristiano Ronaldo - ID 874)
  await testEndpoint('/images/player/874?width=150&height=150&quality=85', 'Player Photo - Cristiano Ronaldo');
  
  // Test 7: Venue image (Old Trafford - ID 55)
  await testEndpoint('/images/venue/55?width=300&height=200&quality=85', 'Venue Image - Old Trafford');
  
  // Test 8: Upcoming fixtures (should include image URLs)
  await testEndpoint('/fixtures/upcoming', 'Upcoming Fixtures with Images');
  
  console.log('🏁 Tests completed!');
  console.log('');
  console.log('📋 Summary:');
  console.log('- Check the responses above for image URLs');
  console.log('- Verify BunnyCDN URLs are being generated');
  console.log('- Test image loading in browser');
  console.log('- Monitor BunnyCDN dashboard for traffic');
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});
