// Load and display shows from shows.json
let allShows = [];
let venues = {};

// Fetch data
fetch('shows.json')
    .then(response => response.json())
    .then(data => {
        allShows = data.shows;
        venues = data.venues;
        renderShows();
    })
    .catch(error => {
        document.getElementById('shows').innerHTML = '<p>Error loading shows. Please try again later.</p>';
        console.error('Error loading shows:', error);
    });

// Filter handlers
document.getElementById('filter-upcoming').addEventListener('change', renderShows);
document.getElementById('filter-free').addEventListener('change', renderShows);
document.getElementById('filter-all-ages').addEventListener('change', renderShows);

// Navigation
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', (e) => {
        const href = e.target.getAttribute('href');
        if (href === '#about') {
            e.preventDefault();
            document.getElementById('shows').style.display = 'none';
            document.getElementById('filter').style.display = 'none';
            document.getElementById('about').style.display = 'block';
        } else if (href === '#list') {
            e.preventDefault();
            document.getElementById('shows').style.display = 'block';
            document.getElementById('filter').style.display = 'block';
            document.getElementById('about').style.display = 'none';
        }
    });
});

function renderShows() {
    const upcomingOnly = document.getElementById('filter-upcoming').checked;
    const freeOnly = document.getElementById('filter-free').checked;
    const allAgesOnly = document.getElementById('filter-all-ages').checked;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter shows
    let filtered = allShows.filter(show => {
        const showDate = new Date(show.date);

        if (upcomingOnly && showDate < today) return false;
        if (freeOnly && !isFree(show.cost)) return false;
        if (allAgesOnly && !isAllAges(show.age)) return false;

        return true;
    });

    // Group by month
    const grouped = groupByMonth(filtered);

    // Render
    const container = document.getElementById('shows');
    if (filtered.length === 0) {
        container.innerHTML = '<p>No shows match your filters.</p>';
        return;
    }

    let html = '';
    for (const [monthKey, shows] of Object.entries(grouped)) {
        html += `<div class="month-group">`;
        html += `<div class="month-header">${monthKey}</div>`;

        shows.forEach(show => {
            html += renderShow(show);
        });

        html += `</div>`;
    }

    container.innerHTML = html;
}

function renderShow(show) {
    const date = new Date(show.date);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    let html = `<div class="show">`;
    html += `<span class="show-date">${dateStr}</span>`;

    // Title
    if (show.linkUrl) {
        html += `<a href="${show.linkUrl}" target="_blank" class="show-title">${show.title}</a>`;
    } else {
        html += `<span class="show-title">${show.title}</span>`;
    }

    // Venue
    html += ` <span class="show-venue">@ ${show.venue.name}</span>`;

    // Details line
    let details = [];
    if (show.time) details.push(show.time);
    if (show.cost) details.push(show.cost);
    if (show.age) details.push(show.age);
    console.log(show)

    if (details.length > 0 || show.details) {
        html += `<div class="show-details">`;
        if (details.length > 0) {
            html += details.join(' • ');
        }
        if (show.details) {
            html += details.length > 0 ? ` • ${show.details}` : show.details;
        }
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function groupByMonth(shows) {
    const groups = {};

    shows.forEach(show => {
        const date = new Date(show.date);
        const key = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(show);
    });

    return groups;
}

function isFree(cost) {
    if (!cost) return false;
    const lower = cost.toLowerCase();
    return lower.includes('free') || lower === '$0' || lower === '0' || lower === 'NOTA';
}

function isAllAges(age) {
    if (!age) return false;
    const lower = age.toLowerCase();
    return lower.includes('all ages') || lower.includes('all-ages') || lower === 'aa';
}
