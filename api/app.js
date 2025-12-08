const express = require("express");
const { Pool } = require("pg");
const app = express();
const fs = require("fs");
const bcrypt = require("bcrypt");
const os = require("os");
const { google } = require("googleapis");

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;
const TICKETMASTER_API_KEY = getSecret("ticketmaster_api_key");

app.use(express.json());
app.use(express.static("web"));
app.get("/", (req, res) =>
    res.sendFile(require("path").join(__dirname, "web", "index.html")),
);

function getSecret(secretName) {
    try {
        return fs.readFileSync(`/run/secrets/${secretName}`, "utf8").trim();
    } catch (err) {
        return process.env[secretName.toUpperCase()] || null;
    }
}

const oauth2Client = new google.auth.OAuth2(
    getSecret("gmail_client_id") || process.env.GMAIL_CLIENT_ID,
    getSecret("gmail_client_secret") || process.env.GMAIL_CLIENT_SECRET,
);

oauth2Client.setCredentials({
    refresh_token:
        getSecret("gmail_refresh_token") || process.env.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

async function sendEmail(to, subject, body) {
    const message = [`To: ${to}`, `Subject: ${subject}`, "", body].join("\n");

    const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
    });
}

const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || "ticket_tracker",
    user: getSecret("db_user") || "postgres",
    password: getSecret("db_password") || "postgres",
});

async function checkAndNotify(event_id, new_price) {
    try {
        // Find users whose threshold is >= new price
        const { rows } = await pool.query(
            `SELECT u.email, u.username, e.name as event_name, uei.threshold
             FROM user_event_interest uei
             JOIN users u ON u.id = uei.user_id
             JOIN events e ON e.id = uei.event_id
             WHERE uei.event_id = $1 AND uei.threshold >= $2`,
            [event_id, new_price],
        );

        // Send email to each user
        for (const user of rows) {
            await sendEmail(
                user.email,
                `Price Alert: ${user.event_name}`,
                `Hi ${user.username},\n\nThe price for ${user.event_name} dropped to $${new_price}, below your threshold of $${user.threshold}.`,
            );
            console.log("Email sent to:", user.email);
        }
    } catch (e) {
        console.error("Notification error:", e);
    }
}

app.get("/health", (req, res) => {
    res.json({ status: "ok", container: os.hostname() });
});

// REGISTER - Client sends plain password, server hashes it
app.post("/auth/register", async (req, res) => {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
        return res
            .status(400)
            .json({ error: "username, email, and password are required" });
    }

    try {
        // Hash password on server
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

        const { rows } = await pool.query(
            `INSERT INTO users(username, email, password_hash, created_at)
             VALUES ($1, $2, $3, now())
             RETURNING id, username, email, created_at`,
            [username, email, password_hash],
        );
        res.status(201).json({ message: "User created", user: rows[0] });
    } catch (e) {
        if (e.code === "23505") {
            return res
                .status(409)
                .json({ error: "username or email already exists" });
        }
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

// LOGIN - Client sends plain password, server verifies hash
app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res
            .status(400)
            .json({ error: "username and password are required" });
    }

    try {
        const { rows } = await pool.query(
            `SELECT id, username, email, password_hash, created_at
             FROM users WHERE username = $1`,
            [username],
        );

        if (!rows.length) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = rows[0];
        const validPassword = await bcrypt.compare(
            password,
            user.password_hash,
        );

        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const { password_hash, ...userWithoutPassword } = user;
        res.json({ message: "Login successful", user: userWithoutPassword });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

// Add a new event to database
// from name, source, venue, city, event_time
app.post("/events", async (req, res) => {
    const {
        external_id,
        name,
        source = "ticketmaster",
        venue,
        city,
        event_time,
    } = req.body || {};

    if (!name || !venue || !city || !event_time) {
        return res
            .status(400)
            .json({ error: "name, venue, city, event_time are required" });
    }

    try {
        const { rows } = await pool.query(
            `
            INSERT INTO events(external_id, name, source, venue, city, event_time)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (external_id) DO UPDATE SET
                name = EXCLUDED.name,
                venue = EXCLUDED.venue,
                city = EXCLUDED.city,
                event_time = EXCLUDED.event_time
            RETURNING id, external_id, name, source, venue, city, event_time
            `,
            [external_id || null, name, source, venue, city, event_time],
        );
        res.status(201).json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

// Get events
// optional query parameters:
// city, after (timestamp), before (timestamp)
app.get("/events", async (req, res) => {
    const { city, after, before } = req.query;
    const params = [city || null, after || null, before || null];

    try {
        const { rows } = await pool.query(
            `
            SELECT id, name, source, venue, city, event_time
            FROM events
            WHERE ($1::text IS NULL OR city = $1)
            AND ($2::timestamptz IS NULL OR event_time >= $2)
            AND ($3::timestamptz IS NULL OR event_time <= $3)
            ORDER BY event_time, id
            `,
            params,
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

// Search for an event from ticketmaster
// Search Ticketmaster for events
app.get("/events/search", async (req, res) => {
    if (!TICKETMASTER_API_KEY) {
        return res
            .status(500)
            .json({ error: "TICKETMASTER_API_KEY not configured" });
    }

    const { keyword, city, size = 20 } = req.query;

    if (!keyword) {
        return res.status(400).json({ error: "keyword is required" });
    }

    try {
        const params = new URLSearchParams({
            apikey: TICKETMASTER_API_KEY,
            keyword,
            size: size.toString(),
            sort: "date,asc",
        });

        if (city) params.append("city", city);

        const tmResponse = await fetch(
            `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
        );

        if (!tmResponse.ok) {
            throw new Error(`Ticketmaster API error: ${tmResponse.status}`);
        }

        const tmData = await tmResponse.json();
        const events = tmData._embedded?.events || [];

        const results = events.map((e) => ({
            external_id: e.id,
            name: e.name,
            venue: e._embedded?.venues?.[0]?.name || "TBA",
            city: e._embedded?.venues?.[0]?.city?.name || "TBA",
            event_time: e.dates?.start?.dateTime || null,
            price_min: e.priceRanges?.[0]?.min || null,
            url: e.url,
        }));

        res.json(results);
    } catch (e) {
        console.error("Search error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Get a specific event by id
app.get("/events/:id", async (req, res) => {
    try {
        const { rows } = await pool.query(
            `
            SELECT id, name, source, venue, city, event_time
            FROM events
            WHERE id = $1
            `,
            [req.params.id],
        );
        if (!rows.length) return res.status(404).json({ error: "Not Found" });
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

// Insert price infromation to DB
// params: event_id, price, observed_at (opt)
app.post("/events/prices", async (req, res) => {
    const { event_id, price, observed_at } = req.body || {};
    if (!event_id || price === undefined) {
        return res
            .status(400)
            .json({ error: "event_id and price are required" });
    }

    try {
        const { rows } = await pool.query(
            `
            INSERT INTO prices(event_id, price, observed_at)
            VALUES ($1, $2, COALESCE($3::timestamptz, now()))
            ON CONFLICT (event_id, observed_at) DO UPDATE SET price = EXCLUDED.price
            RETURNING id, event_id, price, observed_at
            `,
            [event_id, price, observed_at || null],
        );

        checkAndNotify(event_id, price);

        res.status(201).json(rows[0]);
    } catch (e) {
        if (e.code == "23503") {
            return res.status(404).json({ error: "event not found" });
        }
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

// retrieve all prices for an event by its id
app.get("/events/:id/prices", async (req, res) => {
    try {
        const { rows } = await pool.query(
            `
            SELECT id, event_id, price, observed_at
            FROM prices
            WHERE event_id = $1
            ORDER BY observed_at, id
            `,
            [req.params.id],
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

// Insert a user interest
// required params: user_id, event_id, threshold
app.post("/interests", async (req, res) => {
    const { user_id, event_id, threshold } = req.body || {};
    if (!user_id || !event_id || !threshold) {
        return res
            .status(400)
            .json({ error: "user_id, event_id, threshold are required" });
    }

    try {
        const { rows } = await pool.query(
            `
            INSERT INTO user_event_interest(user_id, event_id, threshold, created_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (user_id, event_id) DO UPDATE SET threshold = EXCLUDED.threshold
            RETURNING user_id, event_id, threshold, created_at
            `,
            [user_id, event_id, threshold],
        );
        res.status(201).json(rows[0]);
    } catch (e) {
        if (e.code === "23503") {
            return res.status(404).json({ error: "user or event not found" });
        }
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

// Fetch latest prices for all tracked events
app.post("/admin/fetch-prices", async (req, res) => {
    if (!TICKETMASTER_API_KEY) {
        return res
            .status(500)
            .json({ error: "TICKETMASTER_API_KEY not configured" });
    }

    try {
        const { rows: trackedEvents } = await pool.query(`
            SELECT id, external_id, name
            FROM events
            WHERE external_id IS NOT NULL
              AND event_time > now()
        `);

        let updated = 0;
        let failed = 0;

        for (const event of trackedEvents) {
            try {
                const tmResponse = await fetch(
                    `https://app.ticketmaster.com/discovery/v2/events/${event.external_id}.json?apikey=${TICKETMASTER_API_KEY}`,
                );

                if (!tmResponse.ok) {
                    failed++;
                    continue;
                }

                const tmEvent = await tmResponse.json();
                const minPrice = tmEvent.priceRanges?.[0]?.min;

                if (minPrice) {
                    await pool.query(
                        `
                        INSERT INTO prices (event_id, price)
                        VALUES ($1, $2)
                    `,
                        [event.id, minPrice],
                    );

                    checkAndNotify(event.id, minPrice);
                    updated++;
                }

                await new Promise((r) => setTimeout(r, 200));
            } catch (e) {
                console.error(`Failed to update ${event.name}:`, e.message);
                failed++;
            }
        }

        res.json({
            success: true,
            tracked: trackedEvents.length,
            updated,
            failed,
        });
    } catch (e) {
        console.error("Price fetch error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, "0.0.0.0", () => console.log(`API listening on :${PORT}`));
