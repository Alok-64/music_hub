export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { songId } = req.query;
  if (!songId) {
    return res.status(400).json({ error: 'Missing query parameter "songId"' });
  }

  const API_KEY = process.env.RAPIDAPI_KEY;
  const API_HOST = 'spotify-downloader9.p.rapidapi.com';

  try {
    const response = await fetch(
      `https://${API_HOST}/downloadSong?songId=${encodeURIComponent(songId)}`,
      {
        headers: {
          'x-rapidapi-host': API_HOST,
          'x-rapidapi-key': API_KEY
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream API returned ${response.status}`
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Download proxy error:', err);
    return res.status(500).json({ error: 'Internal proxy error' });
  }
}
