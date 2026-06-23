const searchInput = document.querySelector('.search-box input');
const searchButton = document.querySelector('.search-box button');
const recentCards = document.getElementById('recent-cards');
const searchResultsContainer = document.getElementById('search-results');
const playerPanel = document.getElementById('player-panel');
const coverArtImg = document.getElementById('cover-art');
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingArtist = document.getElementById('now-playing-artist');
const fullTrackLink = document.getElementById('full-track-link');
const navLinks = document.querySelectorAll('.nav-link, .logo-link');
const playerPlayBtn = document.getElementById('player-play-btn');
const playerDownloadBtn = document.getElementById('player-download-btn');

let currentDownloadUrl = '';
let currentDownloadTitle = '';
let currentSpotifyId = '';

// API calls now go through serverless proxy at /api/*
// No API keys exposed in the client

async function instantDownload(url, filename) {
  if (!url || url === '#') {
    showNotification('Download not available for this track.');
    return;
  }

  showNotification(`Downloading "${filename}"...`);

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${filename}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    showNotification(`Downloaded "${filename}" successfully!`);
  } catch (err) {
    // Fallback: open in new tab if CORS blocks the fetch
    console.warn('Blob download failed, using fallback:', err);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.mp3`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

async function fetchDownloadLink(spotifyTrackId) {
  const songUrl = `https://open.spotify.com/track/${spotifyTrackId}`;
  const res = await fetch(
    `/api/download?songId=${encodeURIComponent(songUrl)}`
  );
  if (!res.ok) throw new Error(`Download API returned ${res.status}`);
  const data = await res.json();
  if (data.success && data.data && data.data.downloadLink) {
    return data.data;
  }
  throw new Error(data.message || data.error || 'No download link returned');
}

async function downloadBySpotifyId(spotifyTrackId, title) {
  showNotification(`Fetching download link for "${title}"...`);
  try {
    const data = await fetchDownloadLink(spotifyTrackId);
    await instantDownload(data.downloadLink, title);
  } catch (err) {
    console.error('Download failed:', err);
    showNotification(`Download failed for "${title}". Please try again.`);
  }
}

function navigateWithTransition(url) {
  if (url.startsWith('#')) {
    const element = document.querySelector(url);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      return;
    }
  }

  if (url === 'html') {
    url = 'index.html';
  }

  document.body.style.animation = 'fadeOut 0.5s ease forwards';
  setTimeout(() => {
    window.location.href = url;
  }, 500);
}

const maxRecentSearches = 3;
let recentSearches = [
  { title: 'Lost in the Echo', artist: 'Linkin Park' },
  { title: 'Night Drive', artist: 'Midnight Runner' },
  { title: 'Neon Skyline', artist: 'City Echoes' }
];

function showNotification(message) {
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 2500);
}

function renderRecentSearches() {
  if (!recentCards) return;

  recentCards.innerHTML = recentSearches
    .map(search => {
      return `
        <div class="song-card">
          <div class="song-info">
            <h3>${escapeHtml(search.title)}</h3>
            <p>${escapeHtml(search.artist)}</p>
          </div>
          <button class="download-btn">Download</button>
        </div>
      `;
    })
    .join('');

  attachDownloadListeners();
}

function attachDownloadListeners() {
  if (!recentCards) return;

  const buttons = recentCards.querySelectorAll('.download-btn');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const songCard = button.closest('.song-card');
      const songTitle = songCard.querySelector('h3').textContent;
      showNotification(`Preparing download for "${songTitle}"...`);
    });
  });
}

function addRecentSearch(query) {
  const parsed = parseSearchQuery(query);
  recentSearches = [parsed, ...recentSearches.filter(item => item.title.toLowerCase() !== parsed.title.toLowerCase())];
  recentSearches = recentSearches.slice(0, maxRecentSearches);
  renderRecentSearches();
}

function parseSearchQuery(query) {
  const parts = query.split(' - ').map(part => part.trim());
  if (parts.length === 2) {
    return { title: parts[0], artist: parts[1] };
  }
  return { title: query, artist: 'Recent Search' };
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>"']/g, char => {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return escapeMap[char] || char;
  });
}

function extractSpotifyTrackId(input) {
  const trimmed = (input || '').trim();
  const urlMatch = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]{2,5}\/)?track\/([a-zA-Z0-9]+)/i);
  if (urlMatch) return urlMatch[1];
  const uriMatch = trimmed.match(/^spotify:track:([a-zA-Z0-9]+)$/i);
  if (uriMatch) return uriMatch[1];
  return null;
}

async function handleSpotifyLinkLookup(trackId, originalUrl) {
  showNotification('Loading track from Spotify...');

  try {
    const data = await fetchDownloadLink(trackId);
    const title = data.title || 'Spotify Track';
    const artist = data.artist || 'Unknown Artist';
    const artworkUrl = data.cover || '';

    playPreview('', title, artist, artworkUrl, originalUrl, '', trackId);

    recentSearches = [{ title, artist }, ...recentSearches].slice(0, maxRecentSearches);
    renderRecentSearches();
  } catch (e) {
    console.warn('Spotify download lookup failed:', e);
    showNotification('Could not load track details. Please try again.');
  }
}

async function searchSongsAPI(query) {
  if (!searchResultsContainer) return [];

  searchResultsContainer.innerHTML = `
    <p class="no-results" style="opacity:0.5;animation:pulse 1.2s ease-in-out infinite;">
      Searching...
    </p>`;

  return spotifySearch(query);
}

async function spotifySearch(query) {
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    const data = await response.json();
    if (!data.success || !data.data) {
      showNotification('Search returned no data.');
      renderSearchResults([]);
      return [];
    }

    const trackItems = (data.data.tracks && data.data.tracks.items) || [];
    if (!trackItems.length) {
      showNotification('No results found.');
      renderSearchResults([]);
      return [];
    }

    const results = trackItems.map(track => {
      const artists = (track.artists && track.artists.items || [])
        .map(a => a.profile && a.profile.name || '')
        .filter(Boolean)
        .join(', ');
      const cover = (track.coverArt && track.coverArt[0] && track.coverArt[0].url) || '';
      return {
        title:          track.name || 'Unknown',
        artist:         artists || 'Unknown Artist',
        previewUrl:     '#',
        artworkUrl:     cover,
        fullTrackUrl:   `https://open.spotify.com/track/${track.id}`,
        audioUrl:       '#',
        audiodownload:  '',
        spotifyUrl:     `https://open.spotify.com/track/${track.id}`,
        spotifyTrackId: track.id || '',
        songstatsTrackId: '',
        url:            `https://open.spotify.com/track/${track.id}`
      };
    });

    renderSearchResults(results);
    return results;
  } catch (error) {
    console.error('Search error:', error);
    showNotification('Search failed. Please try again.');
    renderSearchResults([]);
    return [];
  }
}

function renderSearchResults(results) {
  if (!searchResultsContainer) return;

  if (!results.length) {
    searchResultsContainer.innerHTML = '<p class="no-results">No results found. Try a different song or artist.</p>';
    return;
  }

  searchResultsContainer.innerHTML = results
    .map(result => `
      <div class="song-card">
        <div class="song-info">
          <h3>${escapeHtml(result.title)}</h3>
          <p>${escapeHtml(result.artist)}</p>
        </div>
        <div class="result-actions">
          <button class="play-btn"
            data-audio="${escapeHtml(result.audioUrl)}"
            data-artwork="${escapeHtml(result.artworkUrl)}"
            data-fulltrack="${escapeHtml(result.fullTrackUrl)}"
            data-spotify="${escapeHtml(result.spotifyUrl)}"
            data-spotify-id="${escapeHtml(result.spotifyTrackId)}"
            data-songstats="${escapeHtml(result.songstatsTrackId)}"
            data-url="${escapeHtml(result.url)}">
            ▶ Play
          </button>
          ${result.spotifyTrackId ? `
          <button class="download-file-btn" data-spotify-id="${escapeHtml(result.spotifyTrackId)}" data-title="${escapeHtml(result.title)}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>` : ''}
        </div>
      </div>
    `)
    .join('');

  attachSearchResultListeners();
}

function attachSearchResultListeners() {
  if (!searchResultsContainer) return;

  searchResultsContainer.querySelectorAll('.play-btn').forEach(button => {
    button.addEventListener('click', () => {
      const card   = button.closest('.song-card');
      const title  = card.querySelector('h3').textContent;
      const artist = card.querySelector('p').textContent;
      const songstatsId = button.dataset.songstats || '';
      const spotifyId = button.dataset.spotifyId || '';

      if (spotifyId) {
        playPreview('', title, artist, button.dataset.artwork, button.dataset.fulltrack, songstatsId, spotifyId);
      } else if (button.dataset.audio && button.dataset.audio !== '#') {
        playPreview(button.dataset.audio, title, artist, button.dataset.artwork, button.dataset.fulltrack, songstatsId);
      } else if (button.dataset.url && button.dataset.url !== '#') {
        window.open(button.dataset.url, '_blank');
      } else {
        showNotification('Preview not available for this track.');
      }
    });
  });

  searchResultsContainer.querySelectorAll('.download-file-btn').forEach(dl => {
    dl.addEventListener('click', () => {
      const spotifyId = dl.dataset.spotifyId;
      const title = dl.dataset.title || 'track';
      if (spotifyId) {
        downloadBySpotifyId(spotifyId, title);
      } else {
        showNotification('Download not available for this track.');
      }
    });
  });
}

function playPreview(audioUrl, title, artist, artworkUrl, fullTrackUrl, songstatsId, spotifyId = '') {
  const audioElement = document.getElementById('preview-audio');
  const spotifyEmbed = document.getElementById('spotify-embed');
  const nowPlayingId = document.getElementById('now-playing-id');

  if (!audioElement || !spotifyEmbed || !playerPanel) return;

  currentDownloadUrl = audioUrl && audioUrl !== '#' ? audioUrl : '';
  currentDownloadTitle = title || 'track';
  currentSpotifyId = spotifyId || '';

  if (nowPlayingTitle) nowPlayingTitle.textContent = title;
  if (nowPlayingArtist) nowPlayingArtist.textContent = artist;
  if (nowPlayingId) {
    nowPlayingId.textContent = songstatsId ? `Track ID: ${songstatsId}` : '';
    nowPlayingId.style.display = songstatsId ? 'block' : 'none';
  }
  if (coverArtImg && artworkUrl && artworkUrl !== '#') {
    coverArtImg.src = artworkUrl;
    coverArtImg.alt = `${title} cover art`;
  }

  if (fullTrackLink) {
    if (spotifyId) {
      fullTrackLink.href = `https://open.spotify.com/track/${spotifyId}`;
      fullTrackLink.textContent = 'Open in Spotify';
      fullTrackLink.style.display = 'inline-flex';
    } else if (fullTrackUrl && fullTrackUrl !== '#') {
      fullTrackLink.href = fullTrackUrl;
      fullTrackLink.textContent = 'Listen to full track';
      fullTrackLink.style.display = 'inline-flex';
    } else {
      fullTrackLink.style.display = 'none';
    }
  }

  playerPanel.style.display = 'block';
  playerPanel.classList.add('show');

  if (playerDownloadBtn) {
    if (currentSpotifyId || currentDownloadUrl) {
      playerDownloadBtn.style.display = 'inline-flex';
    } else {
      playerDownloadBtn.style.display = 'none';
    }
  }

  if (spotifyId) {
    audioElement.style.display = 'none';
    spotifyEmbed.style.display = 'block';
    spotifyEmbed.src = `https://open.spotify.com/embed/track/${spotifyId}`;
    if (playerPlayBtn) playerPlayBtn.style.display = 'none';
  } else {
    spotifyEmbed.style.display = 'none';
    spotifyEmbed.src = '';
    audioElement.style.display = 'block';
    audioElement.src = audioUrl;
    audioElement.currentTime = 0;
    audioElement.play().then(() => {
      if (playerPlayBtn) playerPlayBtn.style.display = 'none';
    }).catch(() => {
      if (playerPlayBtn) {
        playerPlayBtn.style.display = 'inline-flex';
        playerPlayBtn.onclick = () => {
          audioElement.play().then(() => {
            playerPlayBtn.style.display = 'none';
          }).catch(() => {
            showNotification('Unable to play. Check your browser autoplay settings.');
          });
        };
      }
      showNotification('Autoplay blocked; tap Play to start audio.');
    });
  }
}

async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    showNotification('Type something to search.');
    searchInput.focus();
    return;
  }

  const spotifyTrackId = extractSpotifyTrackId(query);
  if (spotifyTrackId) {
    searchInput.value = '';
    await handleSpotifyLinkLookup(spotifyTrackId, query);
    return;
  }

  showNotification(`Searching for "${query}"...`);
  searchInput.value = '';

  const results = await searchSongsAPI(query);
  if (results.length) {
    addRecentSearch(query);
    const firstResult = results[0];
    if (firstResult.spotifyTrackId) {
      playPreview('', firstResult.title, firstResult.artist, firstResult.artworkUrl, firstResult.fullTrackUrl, '', firstResult.spotifyTrackId);
    } else if (firstResult.previewUrl && firstResult.previewUrl !== '#') {
      playPreview(firstResult.previewUrl, firstResult.title, firstResult.artist, firstResult.artworkUrl, firstResult.fullTrackUrl, firstResult.songstatsTrackId, firstResult.spotifyTrackId);
    }
  }
}

function handleNavClick(event) {
  const target = event.currentTarget;
  const href = target.getAttribute('href');

  if (href && (href.endsWith('.html') || href.startsWith('#'))) {
    event.preventDefault();
    navigateWithTransition(href);
  }
}

navLinks.forEach(link => {
  link.addEventListener('click', handleNavClick);
});

if (playerDownloadBtn) {
  playerDownloadBtn.addEventListener('click', () => {
    if (currentSpotifyId) {
      downloadBySpotifyId(currentSpotifyId, currentDownloadTitle);
    } else if (currentDownloadUrl) {
      instantDownload(currentDownloadUrl, currentDownloadTitle);
    } else {
      showNotification('No downloadable audio for this track.');
    }
  });
}

if (searchButton && searchInput) {
  searchButton.addEventListener('click', handleSearch);
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  });
}

const sloganElement = document.getElementById('dynamic-slogan');
const slogans = [
  'Feel the rhythm, live the moment.',
  'Your next favorite song is one search away.',
  'Music that moves every heartbeat.',
  'Turn your vibe into a playlist.',
  'Every track is a new discovery.',
  'Soundtrack your life with the best beats.',
  'Find the melody that matches your mood.',
  'Let the bass take you higher.',
  'From chill to hype in one click.',
  'Where music and moments connect.'
];
let sloganIndex = 0;

function cycleSlogan() {
  if (!sloganElement) return;
  sloganElement.classList.add('fade-out');
  setTimeout(() => {
    sloganIndex = (sloganIndex + 1) % slogans.length;
    sloganElement.textContent = slogans[sloganIndex];
    sloganElement.classList.remove('fade-out');
  }, 350);
}

if (sloganElement) {
  setInterval(cycleSlogan, 3000);
}

renderRecentSearches();
