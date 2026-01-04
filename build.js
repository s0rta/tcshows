/**
 * Build script to fetch data from Google Sheets and generate shows.json
 *
 * Setup:
 * 1. Create a Google Sheet with two tabs: "Shows" and "Venues"
 * 2. Share settings: Make sure "Anyone with the link" can VIEW
 * 3. Publish to web: File > Share > Publish to web > Select each sheet individually > Web page
 * 4. Get the sheet ID from the URL
 * 5. Update SHEET_ID and GIDs below
 *
 * To find GIDs: Click on each tab and look at the URL for gid=XXXXXX
 *
 * Shows columns: Date, Venue, Show Title, Start Time, Cost, Age, Link URL, Image URL, Details, Multiples #, Notes, Bandcamp URL
 * Venues columns: Name, Address, Website, Neighborhood, Capacity
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BANDCAMP_CACHE_FILE = path.join(__dirname, 'bandcamp-cache.json');

/**
 * Load Bandcamp cache from disk
 */
function loadBandcampCache() {
    try {
        if (fs.existsSync(BANDCAMP_CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(BANDCAMP_CACHE_FILE, 'utf8'));
        }
    } catch (e) {
        console.log('Could not load Bandcamp cache, starting fresh');
    }
    return {};
}

/**
 * Save Bandcamp cache to disk
 */
function saveBandcampCache(cache) {
    fs.writeFileSync(BANDCAMP_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Fetch a URL and return its HTML content
 */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                'User-Agent': 'TCShows/1.0 (Concert Listings Site)'
            }
        };

        protocol.get(options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * Fetch Bandcamp metadata from a URL
 * Returns: { embedHtml, trackTitle, albumTitle, genres, thumbnailUrl }
 */
async function fetchBandcampData(bandcampUrl) {
    if (!bandcampUrl || !bandcampUrl.includes('bandcamp.com')) {
        return null;
    }

    try {
        console.log(`  Fetching Bandcamp: ${bandcampUrl}`);

        let targetUrl = bandcampUrl;
        let pageHtml = await fetchUrl(bandcampUrl);

        // If this is an artist page (no /album/ or /track/), find the latest release
        if (!bandcampUrl.includes('/album/') && !bandcampUrl.includes('/track/')) {
            const latestRelease = extractLatestRelease(pageHtml, bandcampUrl);
            if (latestRelease) {
                targetUrl = latestRelease;
                pageHtml = await fetchUrl(targetUrl);
                console.log(`    Found latest release: ${targetUrl}`);
            }
        }

        // Extract genres/tags and location from the page
        const { genres, location } = extractGenresAndLocation(pageHtml);

        // Extract album/track ID for embed
        const embedInfo = extractEmbedInfo(pageHtml);

        // Extract other metadata
        const albumTitle = extractAlbumTitle(pageHtml);
        const artist = extractArtist(pageHtml);
        const thumbnailUrl = extractThumbnail(pageHtml);

        if (!embedInfo) {
            console.log(`    Could not extract embed info`);
            return { genres, location, embedHtml: null, trackTitle: null, albumTitle };
        }

        // Build embed HTML
        const embedHtml = buildEmbedHtml(embedInfo);

        return {
            embedHtml,
            trackTitle: albumTitle,
            albumTitle,
            artist,
            thumbnailUrl,
            genres,
            location
        };
    } catch (error) {
        console.log(`    Error fetching Bandcamp data: ${error.message}`);
        return null;
    }
}

/**
 * Extract album/track ID from page for embedding
 */
function extractEmbedInfo(html) {
    // Look for album ID
    const albumMatch = html.match(/album[=:](\d+)/);
    if (albumMatch) {
        return { type: 'album', id: albumMatch[1] };
    }

    // Look for track ID
    const trackMatch = html.match(/track[=:](\d+)/);
    if (trackMatch) {
        return { type: 'track', id: trackMatch[1] };
    }

    return null;
}

/**
 * Build Bandcamp embed iframe HTML
 */
function buildEmbedHtml(embedInfo) {
    const baseUrl = 'https://bandcamp.com/EmbeddedPlayer';
    const params = [
        `${embedInfo.type}=${embedInfo.id}`,
        'size=small',
        'bgcol=0a0a0a',
        'linkcol=888888',
        'transparent=true'
    ];

    return `<iframe style="border: 0; width: 100%; height: 42px;" src="${baseUrl}/${params.join('/')}" seamless></iframe>`;
}

/**
 * Extract artist name from page
 */
function extractArtist(html) {
    const match = html.match(/<span itemprop="byArtist"[^>]*>([^<]+)<\/span>/i);
    if (match) return match[1].trim();

    const ogMatch = html.match(/<meta property="og:site_name" content="([^"]+)"/i);
    if (ogMatch) return ogMatch[1];

    return null;
}

/**
 * Extract thumbnail URL from page
 */
function extractThumbnail(html) {
    const match = html.match(/<meta property="og:image" content="([^"]+)"/i);
    return match ? match[1] : null;
}

/**
 * Extract genre tags from Bandcamp page HTML
 * Returns { genres: [...], location: '...' }
 */
function extractGenresAndLocation(html) {
    const allTags = [];

    // Pattern 1: data-tralbum attribute contains tags
    const tagMatch = html.match(/class="tralbum-tags"[^>]*>([\s\S]*?)<\/div>/i);
    if (tagMatch) {
        const tagLinks = tagMatch[1].match(/<a[^>]*>([^<]+)<\/a>/gi);
        if (tagLinks) {
            tagLinks.forEach(link => {
                const text = link.replace(/<[^>]+>/g, '').trim();
                if (text && !allTags.includes(text)) {
                    allTags.push(text);
                }
            });
        }
    }

    // Pattern 2: Look for tags in JSON data
    const jsonMatch = html.match(/data-tralbum="([^"]+)"/);
    if (jsonMatch) {
        try {
            const decoded = jsonMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            const data = JSON.parse(decoded);
            if (data.tags) {
                data.tags.forEach(tag => {
                    if (tag.name && !allTags.includes(tag.name)) {
                        allTags.push(tag.name);
                    }
                });
            }
        } catch (e) {}
    }

    // Pattern 3: Look for tag links in the page
    const tagLinkMatches = html.match(/<a class="tag"[^>]*>([^<]+)<\/a>/gi);
    if (tagLinkMatches) {
        tagLinkMatches.forEach(match => {
            const text = match.replace(/<[^>]+>/g, '').trim();
            if (text && !allTags.includes(text)) {
                allTags.push(text);
            }
        });
    }

    // Last tag is typically location
    const location = allTags.length > 0 ? allTags[allTags.length - 1] : null;
    const genres = allTags.slice(0, -1).slice(0, 4); // All but last, max 4

    return { genres, location };
}

/**
 * Extract the latest release URL from an artist's Bandcamp page
 */
function extractLatestRelease(html, baseUrl) {
    // Look for music grid items
    const albumMatch = html.match(/href="(\/album\/[^"]+)"/);
    if (albumMatch) {
        const base = baseUrl.replace(/\/$/, '');
        return base + albumMatch[1];
    }

    const trackMatch = html.match(/href="(\/track\/[^"]+)"/);
    if (trackMatch) {
        const base = baseUrl.replace(/\/$/, '');
        return base + trackMatch[1];
    }

    return null;
}

/**
 * Extract album title from page
 */
function extractAlbumTitle(html) {
    const match = html.match(/<h2 class="trackTitle"[^>]*>([^<]+)<\/h2>/i);
    if (match) {
        return match[1].trim();
    }
    const ogMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
    if (ogMatch) {
        return ogMatch[1];
    }
    return null;
}

const SHEET_ID = '1eWCdZm_FSyuFwnow2YDpyVtx4zqgaBR04MCIk-YGprQ';
const VENUES_GID = '387912078';
const SHOWS_GID = '514458108';

function fetchCSV(sheetId, gid) {
    return new Promise((resolve, reject) => {
        // Use the gviz/tq endpoint which works better for public sheets
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error(`HTTP ${res.statusCode}: ${data}`);
                    reject(new Error(`Failed to fetch: ${res.statusCode}`));
                    return;
                }
                const rows = parseCSV(data);
                resolve(rows.slice(1)); // Skip header row
            });
        }).on('error', reject);
    });
}

function parseCSV(csv) {
    const rows = [];
    let current = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
        const char = csv[i];
        const next = csv[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            current.push(field);
            field = '';
        } else if (char === '\n' && !inQuotes) {
            current.push(field);
            rows.push(current);
            current = [];
            field = '';
        } else if (char === '\r') {
            continue;
        } else {
            field += char;
        }
    }

    if (field || current.length) {
        current.push(field);
        rows.push(current);
    }

    return rows;
}

async function build() {
    try {
        console.log('Fetching venues...');
        const venuesData = await fetchCSV(SHEET_ID, VENUES_GID);

        // Parse venues into lookup object
        const venues = {};
        venuesData.forEach(row => {
            const [name, address, website, neighborhood, capacity] = row;
            if (name) {
                venues[name] = {
                    name,
                    address: address || '',
                    website: website || '',
                    neighborhood: neighborhood || '',
                    capacity: capacity || ''
                };
            }
        });

        console.log('Fetching shows...');
        const showsData = await fetchCSV(SHEET_ID, SHOWS_GID);

        // Load Bandcamp cache
        const bandcampCache = loadBandcampCache();
        let cacheHits = 0;
        let cacheMisses = 0;

        // Parse shows (need async for Bandcamp fetching)
        const showsRaw = showsData
            .filter(row => row[0] && row[1] && row[2]) // Must have date, venue, title
            .map(row => {
                const [date, venueName, title, time, cost, age, linkUrl, imageUrl, details, multiples, notes, venueId, bandcampUrl] = row;

                return {
                    date,
                    venue: venues[venueName] || { name: venueName },
                    title,
                    time: time || '',
                    cost: cost || '',
                    age: age || '',
                    linkUrl: linkUrl || '',
                    imageUrl: imageUrl || '',
                    details: details || '',
                    multiples: multiples || '',
                    bandcampUrl: bandcampUrl || ''
                };
            });

        // Fetch Bandcamp data for shows that have URLs
        console.log('Processing Bandcamp URLs...');
        const shows = [];
        for (const show of showsRaw) {
            if (show.bandcampUrl) {
                // Support multiple URLs (comma or newline separated)
                const urls = show.bandcampUrl
                    .split(/[,\n]+/)
                    .map(u => u.trim())
                    .filter(u => u && u.includes('bandcamp.com'));

                const bandcampData = [];
                for (const url of urls) {
                    const cacheKey = url.toLowerCase();

                    if (bandcampCache[cacheKey]) {
                        // Use cached data
                        bandcampData.push(bandcampCache[cacheKey]);
                        cacheHits++;
                    } else {
                        // Fetch fresh data
                        const data = await fetchBandcampData(url);
                        if (data) {
                            bandcampData.push(data);
                            bandcampCache[cacheKey] = data;
                            cacheMisses++;
                        }
                    }
                }

                if (bandcampData.length > 0) {
                    show.bandcamp = bandcampData;
                }
            }
            delete show.bandcampUrl; // Don't need the raw URL in output
            shows.push(show);
        }

        // Save updated cache
        saveBandcampCache(bandcampCache);
        console.log(`  Bandcamp cache: ${cacheHits} hits, ${cacheMisses} new fetches`);

        // Sort by date
        shows.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Write to JSON file
        const output = {
            venues,
            shows,
            lastUpdated: new Date().toISOString()
        };

        fs.writeFileSync('shows.json', JSON.stringify(output, null, 2));
        console.log(`✓ Built shows.json with ${shows.length} shows and ${Object.keys(venues).length} venues`);

    } catch (error) {
        console.error('Build failed:', error.message);
        process.exit(1);
    }
}

build();
