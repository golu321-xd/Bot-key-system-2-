const fs = require('fs');
const path = require('path');
const express = require('express');
const { 
  Client, 
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits 
} = require('discord.js');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// === DATABASE FILE ===
const DB_FILE = path.join(__dirname, 'db.json');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }, null, 2));

function readDB(){ return JSON.parse(fs.readFileSync(DB_FILE)); }
function writeDB(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

// === KEY GENERATOR ===
function generateKey(){ 
  return crypto.randomBytes(6).toString('hex');  // 12 chars key
}

// === ENV ===
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.log("Set DISCORD_TOKEN, CLIENT_ID and GUILD_ID.");
  process.exit(1);
}

// === DISCORD CLIENT ===
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// === REGISTER SLASH COMMAND ===
const commands = [
  new SlashCommandBuilder()
    .setName('genkey')
    .setDescription('Generate your private 24 hour key')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );
    console.log("Slash command registered.");
  } catch (e) {
    console.log("Slash command error:", e);
  }
})();

// === BOT ONLINE ===
client.once('ready', () => {
  console.log("Bot ready:", client.user.tag);
});

// ⚡ SLASH COMMAND HANDLING
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  if (interaction.commandName === 'genkey') {
    
    // 🔑 NEW KEY
    const key = generateKey();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
    
    const db = readDB();
    db.keys.push({
      key,
      issuedToDiscordId: interaction.user.id,
      usedByRobloxId: null,
      issuedAt: now,
      expiresAt
    });
    writeDB(db);

    // 🔵 SERVER REPLY (ONLY TO USER) → EPHEMERAL
    await interaction.reply({ 
      content: `🔑 **Your key is generated!**\nCheck your DM.`,
      ephemeral: true
    });

    // 🔒 DM THE KEY
    try {
      await interaction.user.send(
        `🔐 **Your Private Key:**\n\`\`\`${key}\`\`\`\nValid for **24 hours**.\nCopy the key by tapping the code block.`
      );
    } catch {
      await interaction.followUp({
        content: "❌ I can't DM you! Your DMs are blocked.\nHere is your key:\n```\n" + key + "\n```",
        ephemeral: true
      });
    }
  }
});

// === OLD PREFIX COMMAND (OPTIONAL) ===
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!genkey")) return;

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
    await message.author.send(`Your key:\n\`\`\`${key}\`\`\`\nValid 24h.`);
    message.reply("Check DM!");
  } catch {
    message.reply("DM blocked! Key:\n```\n" + key + "\n```");
  }
});

client.login(DISCORD_TOKEN);

// =========================================================
// API PART (KEY VERIFY)
// =========================================================

app.get('/', (req, res) => res.send('ok'));

app.get('/verify', (req, res) => {
  const { key, robloxId } = req.query;

  if (!key || !robloxId)
    return res.status(400).json({ ok:false, error: "missing key or robloxId" });

  const db = readDB();
  const rec = db.keys.find(k => k.key === key);

  if (!rec)
    return res.json({ ok:false, reason: "invalid" });

  const now = Date.now();
  
  // EXPIRED?
  if (now > rec.expiresAt)
    return res.json({ ok:false, reason: "expired" });

  // FIRST TIME USE → LOCK TO ROBLOX ACCOUNT
  if (rec.usedByRobloxId === null) {
    rec.usedByRobloxId = String(robloxId);
    writeDB(db);
    return res.json({ ok:true, message: "verified & locked to this user" });
  }

  // SAME ROBLOX USER USING AGAIN
  if (rec.usedByRobloxId === String(robloxId)) {
    return res.json({ ok:true, message: "verified (already locked to you)" });
  }

  // KEY ALREADY USED BY SOMEONE ELSE
  return res.json({ ok:false, reason: "already_used_by_other" });
});

// === LISTEN ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("API running on port", PORT));
