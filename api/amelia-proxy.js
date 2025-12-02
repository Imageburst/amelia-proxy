/**
 * WP Amelia API Proxy
 * Vercel Serverless Function
 * 
 * Handles CORS and proxies requests to user's WP Amelia installation
 * Uses admin-ajax.php endpoint with Amelia header authentication
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { baseUrl, apiKey, endpoint, method = 'GET', body, params } = req.body;

    // Validation
    if (!baseUrl || !apiKey) {
      return res.status(400).json({ 
        error: 'Missing required fields: baseUrl and apiKey' 
      });
    }

    // Clean and validate base URL
    const cleanUrl = cleanBaseUrl(baseUrl);
    if (!cleanUrl) {
      return res.status(400).json({ 
        error: 'Invalid base URL format. Should be like: https://yoursite.com' 
      });
    }

    // Build the full URL using admin-ajax.php
    const fullUrl = buildAmeliaUrl(cleanUrl, endpoint || '/api/v1/entities', params);

    // Make the request to WP Amelia
    const fetchOptions = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Amelia': apiKey  // Amelia uses this header for auth
      }
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(fullUrl, fetchOptions);

    // Get response text first
    const responseText = await response.text();

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({
        error: 'Invalid JSON response from Amelia',
        rawResponse: responseText.substring(0, 500)
      });
    }

    // Handle non-OK responses
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'WP Amelia API request failed',
        status: response.status,
        data: data
      });
    }

    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Proxy error:', error);
    
    if (error.message.includes('fetch failed') || error.code === 'ENOTFOUND') {
      return res.status(500).json({
        error: 'Cannot reach WordPress site',
        message: 'The WordPress URL may be incorrect or the site may be down',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Proxy request failed',
      message: error.message
    });
  }
}

/**
 * Clean and standardize the base URL
 */
function cleanBaseUrl(url) {
  try {
    let clean = url.trim().replace(/\/+$/, '');
    
    if (!clean.match(/^https?:\/\//)) {
      clean = 'https://' + clean;
    }

    new URL(clean);
    return clean;
  } catch (e) {
    return null;
  }
}

/**
 * Build the complete Amelia API URL using admin-ajax.php
 */
function buildAmeliaUrl(baseUrl, endpoint, params = {}) {
  // Ensure endpoint starts with /api/v1/
  let cleanEndpoint = endpoint;
  if (!cleanEndpoint.startsWith('/api/v1/')) {
    cleanEndpoint = '/api/v1/' + cleanEndpoint.replace(/^\//, '');
  }

  // Build query string from params
  const queryParams = new URLSearchParams(params);
  const queryString = queryParams.toString();
  
  // Construct the admin-ajax URL
  let url = `${baseUrl}/wp-admin/admin-ajax.php?action=wpamelia_api&call=${encodeURIComponent(cleanEndpoint)}`;
  
  if (queryString) {
    url += '&' + queryString;
  }

  return url;
}
