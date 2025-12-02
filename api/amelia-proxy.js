/**
 * WP Amelia API Proxy
 * Vercel Serverless Function
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

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { baseUrl, apiKey, call, method = 'GET', body, queryParams } = req.body;

    if (!baseUrl || !apiKey) {
      return res.status(400).json({ 
        error: 'Missing required fields: baseUrl and apiKey' 
      });
    }

    // Clean base URL
    let cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl.match(/^https?:\/\//)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // Build URL exactly like Postman does
    // Format: {baseUrl}/wp-admin/admin-ajax.php?action=wpamelia_api&call=/api/v1/{endpoint}
    let apiCall = call || '/api/v1/entities';
    if (!apiCall.startsWith('/api/v1')) {
      apiCall = '/api/v1/' + apiCall.replace(/^\//, '');
    }

    let fullUrl = `${cleanUrl}/wp-admin/admin-ajax.php?action=wpamelia_api&call=${apiCall}`;
    
    // Add query params if provided
    if (queryParams && typeof queryParams === 'object') {
      Object.entries(queryParams).forEach(([key, value]) => {
        fullUrl += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      });
    }

    console.log('Full URL:', fullUrl);
    console.log('Method:', method);
    console.log('API Key (first 10 chars):', apiKey.substring(0, 10) + '...');

    // Make request with Amelia header
    const fetchOptions = {
      method: method,
      headers: {
        'Amelia': apiKey
      }
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(fullUrl, fetchOptions);
    const responseText = await response.text();

    console.log('Response status:', response.status);
    console.log('Response (first 200 chars):', responseText.substring(0, 200));

    // Handle empty or "0" response (WordPress returns this for failed ajax)
    if (!responseText || responseText.trim() === '' || responseText.trim() === '0') {
      return res.status(200).json({
        success: false,
        error: 'Empty response from WordPress',
        hint: 'This usually means: invalid API key, API not enabled, or wrong endpoint',
        rawResponse: responseText
      });
    }

    // Check for HTML response
    if (responseText.trim().startsWith('<!') || responseText.trim().toLowerCase().startsWith('<html')) {
      return res.status(200).json({
        success: false,
        error: 'WordPress returned HTML instead of JSON',
        hint: 'Check that Amelia Pro/Elite is installed with API enabled',
        rawResponse: responseText.substring(0, 300)
      });
    }

    // Try to parse JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(200).json({
        success: false,
        error: 'Invalid JSON response',
        rawResponse: responseText.substring(0, 500)
      });
    }

    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      success: false,
      error: 'Proxy request failed',
      message: error.message
    });
  }
}
