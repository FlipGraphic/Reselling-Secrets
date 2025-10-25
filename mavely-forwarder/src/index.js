import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { rewriteTextContent } from './rewriter.js';

const app = express();
app.use(express.json());

const DISCLOSURE = process.env.DISCLOSURE_TEXT || '';
const MAVELY_PUBLISHER_ID = process.env.MAVELY_PUBLISHER_ID || '';
const DESTINATION_WEBHOOK_URL = process.env.DESTINATION_WEBHOOK_URL || '';

// Optional HTTP endpoint to test rewriting via POST { content }
app.post('/rewrite', async (req, res) => {
  const content = String(req.body?.content || '');
  const rewritten = await rewriteTextContent(content, MAVELY_PUBLISHER_ID);
  return res.json({ original: content, rewritten });
});

// Forward via Discord webhook
async function forwardToWebhook(content) {
  if (!DESTINATION_WEBHOOK_URL) return;
  const body = { content: content + (DISCLOSURE ? `\n\n${DISCLOSURE}` : '') };
  await axios.post(DESTINATION_WEBHOOK_URL, body);
}

// Discord bot to listen in source channels
const token = process.env.DISCORD_BOT_TOKEN || '';
const sourceIds = (process.env.SOURCE_CHANNEL_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

let botStarted = false;

if (token && sourceIds.length) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel]
  });

  client.on('ready', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
  });

  client.on('messageCreate', async (message) => {
    try {
      if (message.author.bot) return;
      if (!sourceIds.includes(message.channelId)) return;

      const rewritten = await rewriteTextContent(message.content || '', MAVELY_PUBLISHER_ID);
      if (rewritten && rewritten !== message.content) {
        await forwardToWebhook(rewritten);
      } else if ((message.content || '').match(/https?:\/\/\S+/)) {
        // Still forward even if unchanged, to centralize all links
        await forwardToWebhook(message.content);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  client.login(token).then(() => { botStarted = true; }).catch(err => {
    console.error('Failed to login Discord bot:', err);
  });
}

// Start HTTP server
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`HTTP server listening on :${port}`);
  if (!token || !sourceIds.length) {
    console.log('Discord bot disabled: set DISCORD_BOT_TOKEN and SOURCE_CHANNEL_IDS');
  }
  if (!DESTINATION_WEBHOOK_URL) {
    console.log('Destination webhook not set: set DESTINATION_WEBHOOK_URL');
  }
});
