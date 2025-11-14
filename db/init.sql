CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'ticketmaster',
    venue VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    event_time TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    observed_at TIMESTAMPTZ NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    CONSTRAINT uq_price_event_time UNIQUE(event_id, observed_at)
);

CREATE TABLE IF NOT EXISTS user_event_interest (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    threshold NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, event_id)
);
