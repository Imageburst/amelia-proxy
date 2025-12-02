/**
 * WP Amelia API Proxy
 * Vercel Serverless Function
 * 
 * Handles CORS and proxies requests to user's WP Amelia installation
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Change to your domain in production
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
    const { baseUrl, apiKey, endpoint, method = 'GET', body } = req.body;

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
        error: 'Invalid base URL format. Should be like: https://yoursite.com or https://yoursite.com/wp-json/amelia/v1/' 
      });
    }

    // Build the full URL
    const fullUrl = buildAmeliaUrl(cleanUrl, endpoint || 'settings', apiKey);

    // Make the request to WP Amelia
    const fetchOptions = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(fullUrl, fetchOptions);

    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'WP Amelia API request failed',
        status: response.status,
        message: errorText,
        details: 'Check if your API key is valid and your WordPress site is accessible'
      });
    }

    // Parse and return the data
    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Proxy error:', error);
    
    // Provide helpful error messages
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
    // Remove trailing slashes
    let clean = url.trim().replace(/\/+$/, '');
    
    // Add https:// if no protocol
    if (!clean.match(/^https?:\/\//)) {
      clean = 'https://' + clean;
    }

    // Validate URL format
    new URL(clean);

    // If it already has the full Amelia path, extract just the base
    if (clean.includes('/wp-json/amelia')) {
      const match = clean.match(/(https?:\/\/[^\/]+)/);
      if (match) {
        clean = match[1];
      }
    }

    return clean;
  } catch (e) {
    return null;
  }
}

/**
 * Build the complete Amelia API URL
 */
function buildAmeliaUrl(baseUrl, endpoint, apiKey) {
  // Remove leading slash from endpoint if present
  const cleanEndpoint = endpoint.replace(/^\//, '');
  
  // Build the full URL with API key
  return `${baseUrl}/wp-json/amelia/v1/${cleanEndpoint}?ameliaApiKey=${apiKey}`;
}
