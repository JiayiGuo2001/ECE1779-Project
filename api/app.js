const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());
app.use(express.static('web'));
app.get('/', (req,res)=>res.sendFile(require('path').join(__dirname,'web','index.html')));

const PORT = process.env.PORT || 3000;

const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || "ticket_tracker",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
});

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// Create a user with username and email
app.post("/users", async (req, res) => {
    const { username, email } = req.body || {};
    if (!username || !email) {
        return res
            .status(400)
            .json({ error: "username and email are required" });
    }

    try {
        const { rows } = await pool.query(
            `
            INSERT INTO users(username, email, created_at)
            VALUES ($1, $2, now())
            RETURNING id, username, email, created_at
            `,
            [username, email],
        );
        res.status(201).json(rows[0]);
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

// Add a new event to database
// from name, source, venue, city, event_time
app.post("/events", async (req, res) => {
    const {
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
            INSERT INTO events(name, source, venue, city, event_time)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, source, venue, city, event_time
            `,
            [name, source, venue, city, event_time],
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
            RETURNING user_id, event_id, threshold, created_at
            `,
            [user_id, event_id, threshold],
        );
        res.status(201).json(rows[0]);
    } catch (e) {
        if (e.code === "23503") {
            return res.status(404).json({ error: "user or event not found" });
        }
        if (e.code === "23505") {
            return res.status(409).json({ error: "interest already exists" });
        }
        console.error(e);
        res.status(500).json({ error: "internal" });
    }
});

app.listen(PORT, "0.0.0.0", () => console.log(`API listening on :${PORT}`));
