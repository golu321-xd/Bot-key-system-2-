const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const DB_FILE = path.join(__dirname, 'db.json');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }, null, 2));
function readDB(){ return JSON.parse(fs.readFileSync(DB_FILE)); }
function writeDB(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function generateKey(){ return crypto.randomBytes(6).toString('hex'); } // 12 chars

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
  console.log("Set DISCORD_TOKEN.");
  process.exit(1);
}

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log('Bot ready as', client.user.tag);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // ⭐ ANYONE CAN GENERATE KEY FOR THEMSELVES
  if (cmd === 'genkey') {
    const key = generateKey();
    const now = Date.now();
    const expiresAt = now + 24*60*60*1000;

    const db = readDB();
    db.keys.push({
      key,
      issuedToDiscordId: message.author.id,
      usedByRobloxId: null,
      issuedAt: now,
      expiresAt
    });
    writeDB(db);

    try {
      await message.author.send(
        `Your key: **${key}**\nValid for 24 hours.\nUse it in Roblox script.`
      );
      message.reply("Check DM! I sent your key.");
    } catch (e) {
      message.reply("DM blocked! Key: " + key);
    }
  }
});

client.login(DISCORD_TOKEN);

// === API PART ===

app.get('/', (req, res) => res.send('ok'));

app.get('/verify', (req, res) => {
  const { key, robloxId } = req.query;
  if (!key || !robloxId) 
    return res.status(400).json({ ok:false, error: "missing key or robloxId" });

  const db = readDB();
  const rec = db.keys.find(k => k.key === key);
  if (!rec) return res.json({ ok:false, reason: "invalid" });

  const now = Date.now();
  if (now > rec.expiresAt)
    return res.json({ ok:false, reason: "expired" });

  // Lock key to first roblox user
  if (rec.usedByRobloxId === null) {
    rec.usedByRobloxId = String(robloxId);
    writeDB(db);
    return res.json({ ok:true, message: "valid, now locked to your account" });
  }

  if (rec.usedByRobloxId === String(robloxId)) {
    return res.json({ ok:true, message: "valid (already locked to you)" });
  }

  return res.json({ ok:false, reason: "already used by another player" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
