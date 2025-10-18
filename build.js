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
 * Shows columns: Date, Venue, Show Title, Start Time, Cost, Age, Link URL, Image URL, Details, Multiples #, Notes
 * Venues columns: Name, Address, Website, Neighborhood, Capacity
 */

const https = require('https');
const fs = require('fs');

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

        // Parse shows
        const shows = showsData
            .filter(row => row[0] && row[1] && row[2]) // Must have date, venue, title
            .map(row => {
                const [date, venueName, title, time, cost, age, linkUrl, imageUrl, details, multiples, notes] = row;

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
                };
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date));

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
