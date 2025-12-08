const fetch = require("node-fetch");
const https = require("https");

const agent = new https.Agent({
    rejectUnauthorized: false,
});

async function main(args) {
    const apiUrl = process.env.API_URL;

    if (!apiUrl) {
        return { body: { error: "API_URL not configured" } };
    }

    try {
        const response = await fetch(`${apiUrl}/admin/fetch-prices`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            agent: agent,
        });

        const data = await response.json();
        return { body: { timestamp: new Date().toISOString(), ...data } };
    } catch (e) {
        return { body: { error: e.message } };
    }
}

exports.main = main;
