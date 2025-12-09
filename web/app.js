// Config
const API = {
    listEvents: "/events",
    // if your API is /events/:id/prices:
    getPrices: (id) => `/events/${id}/prices`,
    // if your API only offers POST /events and POST /events/prices:
    createEvent: "/events",
    postPrice: "/events/prices",
    login: "/auth/login",
    register: "/auth/register",
    createInterest: "/interests",
    searchEvents: "/events/search",
};

async function fetchJSON(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(await r.text());
    return r.json().catch(() => ({}));
}

const sel = document.getElementById("eventSelect");
const trackBtn = document.getElementById("trackBtn");
const loadBtn = document.getElementById("loadBtn");
const statusEl = document.getElementById("status");
const ctx = document.getElementById("chart").getContext("2d");
const thresholdInput = document.getElementById("trackThreshold");
const trackMessage = document.getElementById("trackMessage");

let chart;
let currentEventId = null;
const tracked = new Set(JSON.parse(localStorage.getItem("tracked") || "[]"));
let currentUser = null;

updateStatus();
updateAuthUI();

function setTracked(id, on) {
    if (on) tracked.add(String(id));
    else tracked.delete(String(id));
    localStorage.setItem("tracked", JSON.stringify([...tracked]));
    updateTrackBtn();
    updateStatus();
}

function updateStatus() {
    statusEl.textContent = tracked.size
        ? `Tracking ${tracked.size} event(s)`
        : "Not tracking any event yet";
}

function updateAuthUI() {
    const badge = document.getElementById("authStatusBadge");
    const nameEl = document.getElementById("authUserName");
    const logoutBtn = document.getElementById("logoutButton");

    if (!badge || !nameEl || !logoutBtn) return;

    if (currentUser) {
        badge.textContent = "Signed in";
        nameEl.textContent = currentUser.username;
        logoutBtn.disabled = false;
    } else {
        badge.textContent = "Signed out";
        nameEl.textContent = "Not signed in";
        logoutBtn.disabled = true;
    }
}

function updateTrackBtn() {
    if (!currentEventId) {
        trackBtn.disabled = true;
        return;
    }
    trackBtn.disabled = false;
    trackBtn.textContent = "Save alert";
}

async function createInterestForCurrentUser(threshold) {
    if (!currentUser) {
        alert("Please sign in first to receive email alerts.");
        return false;
    }
    if (!currentEventId) {
        alert("Please select an event first.");
        return false;
    }

    try {
        await fetchJSON(API.createInterest, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: currentUser.id,
                event_id: Number(currentEventId),
                threshold: Number(threshold),
            }),
        });
        return true;
    } catch (err) {
        console.error("createInterest error", err);
        const msg = String(err.message || "");

        if (msg.includes("already exists") || msg.includes("23505")) {
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Demo Concert",
            source: "ticketmaster",
            venue: "Scotiabank Arena",
            city: "Toronto",
            event_time: new Date(
                Date.now() + 7 * 24 * 3600 * 1000,
            ).toISOString(),
        }),
    });
    return fetchJSON(API.listEvents);
}

async function loadEvents() {
    const events = await ensureAtLeastOneEvent();
    sel.innerHTML = events
        .map((e) => `<option value="${e.id}">${e.name}</option>`)
        .join("");
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
    const labels = rows.map((r) =>
        new Date(r.observed_at || r.ts).toLocaleTimeString(),
    );
    const data = rows.map((r) =>
        Number(r.price_all_in ?? r.price_base ?? r.price),
    );
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{ label: "Price", data, tension: 0.25 }] },
        options: {
            responsive: true,
            animation: false,
            scales: { x: { ticks: { maxTicksLimit: 8 } } },
        },
    });
}

async function addSampleTicks(eventId) {
    // write 5 points spaced by ~1 minute (timestamps now -4..0 min)
    const now = Date.now();
    for (let i = 4; i >= 0; i--) {
        const payload = {
            event_id: Number(eventId),
            price: 110 + Math.round(Math.random() * 30),
            observed_at: new Date(now - i * 60 * 1000).toISOString(),
        };
        await fetchJSON(API.postPrice, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        }).catch(console.warn);
    }
    await loadPrices(eventId);
}

// --- Wire up UI ---
sel.addEventListener("change", (e) => loadPrices(e.target.value));

trackBtn.addEventListener("click", async () => {
    if (!currentEventId) return;

    if (!thresholdInput) {
        alert("Threshold input not found in UI.");
        return;
    }

    if (trackMessage) trackMessage.textContent = "";

    const raw = (thresholdInput.value || "").trim();
    const threshold = Number(raw);

    if (!raw) {
        alert("Please enter your alert price.");
        return;
    }
    if (!Number.isFinite(threshold) || threshold <= 0) {
        alert("Please enter a valid positive number.");
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
        alert("Failed to save email alert. Please try again.");
    }
});

loadBtn.addEventListener("click", () => addSampleTicks(currentEventId));

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutButton");

if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        loginError.textContent = "";
        loginButton.disabled = true;

        const username = document.getElementById("loginUsername").value.trim();
        const password = document.getElementById("loginPassword").value.trim();

        if (!username || !password) {
            loginError.textContent = "Please enter username and password.";
            loginButton.disabled = false;
            return;
        }

        try {
            const data = await fetchJSON(API.login, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            currentUser = data.user || null;
            updateAuthUI();
            loginForm.reset();
        } catch (err) {
            console.error(err);
            loginError.textContent = "Login failed. Check your credentials.";
        } finally {
            loginButton.disabled = false;
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        currentUser = null;
        updateAuthUI();
    });
}

// Register UI wiring
const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerButton");
const registerError = document.getElementById("registerError");

if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        registerError.textContent = "";
        registerButton.disabled = true;

        const username = document
            .getElementById("registerUsername")
            .value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document
            .getElementById("registerPassword")
            .value.trim();

        if (!username || !email || !password) {
            registerError.textContent =
                "Please fill in username, email, and password.";
            registerButton.disabled = false;
            return;
        }

        try {
            const data = await fetchJSON(API.register, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password }),
            });

            // After successful registration, login automatically
            currentUser = data.user || { username, email };
            updateAuthUI();
            registerForm.reset();
            registerError.textContent = "Account created. You are signed in.";
        } catch (err) {
            console.error(err);
            // Failed to create account
            registerError.textContent =
                "Failed to create account. Username or email may already exist.";
        } finally {
            registerButton.disabled = false;
        }
    });
}

// --- Search Events UI ---
const searchBtn = document.getElementById("searchBtn");
const searchKeyword = document.getElementById("searchKeyword");
const searchCity = document.getElementById("searchCity");
const searchResults = document.getElementById("searchResults");
const searchStatus = document.getElementById("searchStatus");

async function searchEvents() {
    const keyword = (searchKeyword?.value || "").trim();
    if (!keyword) {
        if (searchStatus) searchStatus.textContent = "Please enter a keyword.";
        return;
    }

    const city = (searchCity?.value || "").trim();

    if (searchStatus) searchStatus.textContent = "Searching...";
    if (searchResults) searchResults.innerHTML = "";

    try {
        const params = new URLSearchParams({ keyword });
        if (city) params.append("city", city);

        const results = await fetchJSON(`${API.searchEvents}?${params}`);

        if (!results.length) {
            if (searchStatus) searchStatus.textContent = "No events found.";
            return;
        }

        if (searchStatus)
            searchStatus.textContent = `Found ${results.length} event(s).`;
        renderSearchResults(results);
    } catch (err) {
        console.error("Search error:", err);
        if (searchStatus)
            searchStatus.textContent = "Search failed. Please try again.";
    }
}

function renderSearchResults(results) {
    if (!searchResults) return;

    searchResults.innerHTML = results
        .map((event) => {
            const date = event.event_time
                ? new Date(event.event_time).toLocaleDateString()
                : "TBA";
            const price = event.price_min ? `$${event.price_min}` : "";

            return `
      <div class="search-result" data-event='${JSON.stringify(event).replace(/'/g, "&#39;")}'>
        <div class="search-result-info">
          <div class="search-result-name">${escapeHtml(event.name)}</div>
          <div class="search-result-meta">${escapeHtml(event.venue)} · ${escapeHtml(event.city)} · ${date}</div>
        </div>
        ${price ? `<div class="search-result-price">From ${price}</div>` : ""}
        <button class="add-event-btn" style="font-size:12px; padding:6px 12px;">Add</button>
      </div>
    `;
        })
        .join("");

    // Attach click handlers to all Add buttons
    searchResults.querySelectorAll(".add-event-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const row = e.target.closest(".search-result");
            const eventData = JSON.parse(row.dataset.event);
            await addEventToDb(eventData, e.target);
        });
    });
}

function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function addEventToDb(event, btn) {
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Adding...";
    }

    try {
        await fetchJSON(API.createEvent, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                external_id: event.external_id,
                name: event.name,
                source: "ticketmaster",
                venue: event.venue,
                city: event.city,
                event_time: event.event_time,
            }),
        });

        if (btn) {
            btn.textContent = "Added ✓";
            btn.style.background = "rgba(34, 197, 94, 0.3)";
        }

        // Refresh the events dropdown
        await loadEvents();
    } catch (err) {
        console.error("Add event error:", err);
        if (btn) {
            btn.textContent = "Failed";
            btn.disabled = false;
        }
    }
}

if (searchBtn) {
    searchBtn.addEventListener("click", searchEvents);
}

// Allow pressing Enter in keyword field to search
if (searchKeyword) {
    searchKeyword.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            searchEvents();
        }
    });
}

// init
loadEvents().catch((err) => {
    console.error(err);
    statusEl.textContent = "Failed to load events. Check API routes.";
});
