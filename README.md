# TCShows

A minimalist concert aggregator for Twin Cities shows, inspired by [rishows.com](https://rishows.com).

## Features

- Plain text, minimal CSS aesthetic
- Spreadsheet-backed (Google Sheets)
- Filter by upcoming/free/all-ages shows
- Venue information with foreign key relationship
- Mobile-friendly responsive design
- Static HTML - fast and simple

## Setup

### 1. Create Google Sheets

Create a Google Sheet with two tabs:

**Shows Tab:**
- Columns: `Date` | `Venue` | `Show Title` | `Start Time` | `Cost` | `Age` | `Link URL` | `Image URL` | `Details` | `Multiples #` | `Notes to Admins`
- Date, Venue, and Show Title are required
- Venue should match a name from the Venues tab

**Venues Tab:**
- Columns: `Name` | `Address` | `Website` | `Neighborhood` | `Capacity`
- Name is the foreign key used by Shows

### 2. Make Sheet Public

1. Click "Share" in Google Sheets
2. Change to "Anyone with the link can view"
3. Copy the Sheet ID from the URL (the long string between `/d/` and `/edit`)

### 3. Get Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Sheets API
4. Create credentials (API key)
5. Restrict the key to Google Sheets API (optional but recommended)

### 4. Build the Site

```bash
# Set environment variables
export GOOGLE_SHEET_ID="your_sheet_id_here"
export GOOGLE_API_KEY="your_api_key_here"

# Run build script
node build.js
```

This generates `shows.json` from your Google Sheet.

### 5. Serve Locally

```bash
# Simple Python server
python3 -m http.server 8000

# Or use any static file server
npx serve .
```

Visit `http://localhost:8000`

## Deployment

### GitHub Pages

1. Push to GitHub
2. Enable GitHub Pages in repo settings
3. Set up GitHub Actions to run `build.js` on schedule
4. Deploy to `gh-pages` branch

### Netlify

1. Connect repo to Netlify
2. Add environment variables in Netlify dashboard
3. Set build command: `node build.js`
4. Set publish directory: `.`
5. Optional: Set up scheduled builds to refresh data

## Data Structure

### Shows
```javascript
{
  "date": "2025-10-25",
  "venue": { "name": "First Avenue", "address": "...", ... },
  "title": "Cool Band",
  "time": "8:00 PM",
  "cost": "$15",
  "age": "18+",
  "linkUrl": "https://...",
  "imageUrl": "https://...",
  "details": "With special guests",
  "multiples": ""
}
```

### Venues
```javascript
{
  "First Avenue": {
    "name": "First Avenue",
    "address": "701 1st Ave N, Minneapolis",
    "website": "https://first-avenue.com",
    "neighborhood": "Downtown",
    "capacity": "1500"
  }
}
```

## Customization

- Edit [style.css](style.css) for styling (keep it minimal!)
- Modify [script.js](script.js) for filtering/display logic
- Update [index.html](index.html) for structure changes

## Philosophy

Inspired by the DIY aesthetic of rishows.com - prioritizing function over form, community over complexity, and accessibility over aesthetics.

## License

MIT
