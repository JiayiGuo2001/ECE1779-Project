// Config
const API = {
  listEvents: '/events',
  // if your API is /events/:id/prices:
  getPrices: (id) => `/events/${id}/prices`,
  // if your API only offers POST /events and POST /events/prices:
  createEvent: '/events',
  postPrice: '/events/prices',
  login: '/auth/login',
  register: '/auth/register',
  createInterest: '/interests',
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
const thresholdInput = document.getElementById('trackThreshold');
const trackMessage   = document.getElementById('trackMessage');

let chart;
let currentEventId = null;
const tracked = new Set(JSON.parse(localStorage.getItem('tracked') || '[]'));
let currentUser = null;

updateStatus();
updateAuthUI();

function setTracked(id, on) {
  if (on) tracked.add(String(id)); 
  else tracked.delete(String(id));
  localStorage.setItem('tracked', JSON.stringify([...tracked]));
  updateTrackBtn();
  updateStatus();
}

function updateStatus() {
  statusEl.textContent = tracked.size
    ? `Tracking ${tracked.size} event(s)`
    : 'Not tracking any event yet';
}

function updateAuthUI() {
  const badge = document.getElementById('authStatusBadge');
  const nameEl = document.getElementById('authUserName');
  const logoutBtn = document.getElementById('logoutButton');

  if (!badge || !nameEl || !logoutBtn) return; 

  if (currentUser) {
    badge.textContent = 'Signed in';
    nameEl.textContent = currentUser.username;
    logoutBtn.disabled = false;
  } else {
    badge.textContent = 'Signed out';
    nameEl.textContent = 'Not signed in';
    logoutBtn.disabled = true;
  }
}

function updateTrackBtn() {
  if (!currentEventId) {
    trackBtn.disabled = true;
    return;
  }
  trackBtn.disabled = false;
  trackBtn.textContent = 'Save alert';
}

async function createInterestForCurrentUser(threshold) {
  if (!currentUser) {
    alert('Please sign in first to receive email alerts.');
    return false;
  }
  if (!currentEventId) {
    alert('Please select an event first.');
    return false;
  }

  try {
    await fetchJSON(API.createInterest, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        event_id: Number(currentEventId),
        threshold: Number(threshold),
      }),
    });
    return true;
  } catch (err) {
    console.error('createInterest error', err);
    const msg = String(err.message || '');

    if (msg.includes('already exists') || msg.includes('23505')) {
      return true;
    }
    throw err;
  }
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

trackBtn.addEventListener('click', async () => {
  if (!currentEventId) return;

  if (!thresholdInput) {
    alert('Threshold input not found in UI.');
    return;
  }

  if (trackMessage) trackMessage.textContent = '';

  const raw = (thresholdInput.value || '').trim();
  const threshold = Number(raw);

  if (!raw) {
    alert('Please enter your alert price.');
    return;
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    alert('Please enter a valid positive number.');
    return;
  }

  try {
    const ok = await createInterestForCurrentUser(threshold);
    if (!ok) return;

    setTracked(currentEventId, true);

    if (trackMessage) {
      trackMessage.textContent = `Email alert set at $${threshold.toFixed(2)}.`;
    }
  } catch (err) {
    console.error(err);
    alert('Failed to save email alert. Please try again.');
  }
});

loadBtn.addEventListener('click', () => addSampleTicks(currentEventId));

const loginForm      = document.getElementById('loginForm');
const loginButton    = document.getElementById('loginButton');
const loginError     = document.getElementById('loginError');
const logoutBtn      = document.getElementById('logoutButton');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginButton.disabled = true;

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!username || !password) {
      loginError.textContent = 'Please enter username and password.';
      loginButton.disabled = false;
      return;
    }

    try {
      const data = await fetchJSON(API.login, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ username, password })
      });

      currentUser = data.user || null;
      updateAuthUI();
      loginForm.reset();
    } catch (err) {
      console.error(err);
      loginError.textContent = 'Login failed. Check your credentials.';
    } finally {
      loginButton.disabled = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    currentUser = null;
    updateAuthUI();
  });
}

// Register UI wiring
const registerForm   = document.getElementById('registerForm');
const registerButton = document.getElementById('registerButton');
const registerError  = document.getElementById('registerError');

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    registerButton.disabled = true;

    const username = document.getElementById('registerUsername').value.trim();
    const email    = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();

    if (!username || !email || !password) {
      registerError.textContent = 'Please fill in username, email, and password.';
      registerButton.disabled = false;
      return;
    }

    try {
      const data = await fetchJSON(API.register, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      // After successful registration, login automatically
      currentUser = data.user || { username, email };
      updateAuthUI();
      registerForm.reset();
      registerError.textContent = 'Account created. You are signed in.';
    } catch (err) {
      console.error(err);
      // Failed to create account
      registerError.textContent = 'Failed to create account. Username or email may already exist.';
    } finally {
      registerButton.disabled = false;
    }
  });
}


// init
loadEvents().catch(err => {
  console.error(err);
  statusEl.textContent = 'Failed to load events. Check API routes.';
});
