// --- Config: adapt here if your backend routes differ ---
const API = {
  listEvents: '/events',
  // if your API is /events/:id/prices:
  getPrices: (id) => `/events/${id}/prices`,
  // if your API only offers POST /events and POST /events/prices:
  createEvent: '/events',
  postPrice: '/events/prices'
};

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json().catch(() => ({}));
}

const sel = document.getElementById('eventSelect');
const trackBtn = document.getElementById('trackBtn');
const loadBtn  = document.getElementById('loadBtn');
const statusEl = document.getElementById('status');
const ctx = document.getElementById('chart').getContext('2d');

let chart;
let currentEventId = null;
const tracked = new Set(JSON.parse(localStorage.getItem('tracked') || '[]'));
updateStatus();

function setTracked(id, on) {
  if (on) tracked.add(String(id)); else tracked.delete(String(id));
  localStorage.setItem('tracked', JSON.stringify([...tracked]));
  updateTrackBtn();
  updateStatus();
}

function updateStatus() {
  statusEl.textContent = tracked.size
    ? `Tracking ${tracked.size} event(s)`
    : 'Not tracking any event yet';
}

function updateTrackBtn() {
  if (!currentEventId) { trackBtn.disabled = true; return; }
  trackBtn.disabled = false;
  const on = tracked.has(String(currentEventId));
  trackBtn.textContent = on ? 'Untrack' : 'Track';
}

async function ensureAtLeastOneEvent() {
  let events = await fetchJSON(API.listEvents);
  if (!Array.isArray(events)) events = [];
  if (events.length) return events;
  // create a demo event if the list is empty
  const demo = await fetchJSON(API.createEvent, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      name: 'Demo Concert',
      source: 'ticketmaster',
      venue: 'Scotiabank Arena',
      city: 'Toronto',
      event_time: new Date(Date.now()+7*24*3600*1000).toISOString()
    })
  });
  return fetchJSON(API.listEvents);
}

async function loadEvents() {
  const events = await ensureAtLeastOneEvent();
  sel.innerHTML = events.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  if (events.length) {
    currentEventId = events[0].id;
    sel.value = currentEventId;
    updateTrackBtn();
    await loadPrices(currentEventId);
  }
}

async function loadPrices(eventId) {
  currentEventId = eventId;
  updateTrackBtn();
  const rows = await fetchJSON(API.getPrices(eventId));
  // Normalize expected fields: observed_at/ts, price or price_all_in
  const labels = rows.map(r => new Date(r.observed_at || r.ts).toLocaleTimeString());
  const data   = rows.map(r => Number(r.price_all_in ?? r.price_base ?? r.price));
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Price', data, tension: 0.25 }] },
    options: {
      responsive: true,
      animation: false,
      scales: { x: { ticks: { maxTicksLimit: 8 } } }
    }
  });
}

async function addSampleTicks(eventId) {
  // write 5 points spaced by ~1 minute (timestamps now -4..0 min)
  const now = Date.now();
  for (let i = 4; i >= 0; i--) {
    const payload = {
      event_id: Number(eventId),
      price: 110 + Math.round(Math.random()*30),
      observed_at: new Date(now - i*60*1000).toISOString()
    };
    await fetchJSON(API.postPrice, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).catch(console.warn);
  }
  await loadPrices(eventId);
}

// --- Wire up UI ---
sel.addEventListener('change', (e) => loadPrices(e.target.value));
trackBtn.addEventListener('click', () => setTracked(currentEventId, !tracked.has(String(currentEventId))));
loadBtn.addEventListener('click', () => addSampleTicks(currentEventId));

// init
loadEvents().catch(err => {
  console.error(err);
  statusEl.textContent = 'Failed to load events. Check API routes.';
});
