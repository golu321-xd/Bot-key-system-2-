import fetch from "node-fetch";

const URL = "https://bot-key-system-2.onrender.com"; // <-- Apna Render URL

async function keepAlive() {
    try {
        const res = await fetch(URL);
        console.log("Ping sent → Status:", res.status);
    } catch (err) {
        console.log("Ping failed:", err.message);
    }
}

// Every 5 minutes
setInterval(keepAlive, 5 * 60 * 1000);

console.log("Uptime monitor loaded...");
