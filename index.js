require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");

// ─── Clients ──────────────────────────────────────────────────────────────────
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── In-memory conversation history (per user) ────────────────────────────────
const histories = new Map();
const MAX_HISTORY = 10;

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an assistant for the RWA NFT FI ecosystem — a Web3 platform built on Binance Smart Chain.

🌍 LANGUAGE RULE (CRITICAL):
Always reply in the EXACT same language the user used.
Russian → Russian. English → English. Arabic → Arabic. Spanish → Spanish. Chinese → Chinese. Etc.
Never switch languages unless the user switches first.

📌 ABOUT RWA NFT FI:
- Web3 ecosystem on BSC: Real World Asset tokenization, DeFi tools, binary network marketing
- NFT gives access to: DA token mining (NFTM), smart loans up to 70% LTV in USDT, ecosystem income
- Token $DA: deflationary model, 100% backed by USDT, max supply 21M, burns on every sale
- Binary network: 22 levels, 8M+ positions, 99% of funds go back to network via smart contract
- Compression: income from inactive partners rises to active ones
- Matching bonus: earn from partners' income on 3 lines
- CertiK audit (May 2026): 73 findings, 55 resolved, 1 critical — fixed
- UK Trademark: UK00004369823
- DAO governance: 20 Guardians + multisig 2/3
- Smart contracts deployed on BSC, verified on-chain

🔗 USEFUL LINKS:
- Platform: https://app.rwanftfi.com
- Whitepaper: https://whitepaper.rwanftfi.com
- Brandbook: https://brandbook.rwanftfi.com
- Deck: https://deck.rwanftfi.com
- DAO: https://app.rwanftfi.com/dao-governance
- Smart Contracts: https://app.rwanftfi.com/smart-contracts
- CertiK Audit: https://skynet.certik.com/projects/rwanftfi
- Terms: https://app.rwanftfi.com/terms

💬 TONE:
- Direct, factual, no hype
- Specific numbers over general phrases
- If you don't know something — say so and point to the relevant link
- Never promise income or returns
- Never say "this is not a pyramid" as a first response — address the actual concern

❓ COMMON QUESTIONS & HOW TO ANSWER:
Q: "Is this a scam / pyramid?" → Explain: transparent smart contract, on-chain verification, CertiK audit, DAO governance, UK trademark
Q: "I don't understand crypto" → Explain: step-by-step system, low entry threshold, community support
Q: "Where does money for payouts come from?" → Explain: 99% back to network via smart contract, real asset tokenization, not a ponzi
Q: "How do smart loans work?" → Explain: deposit NFT as collateral, receive up to 70% of DA value in USDT, keep the NFT

If asked something outside your knowledge, politely say you'll need to check and direct them to the official resources.`;

// ─── Helper: trim history ─────────────────────────────────────────────────────
function getHistory(userId) {
  if (!histories.has(userId)) histories.set(userId, []);
  return histories.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY * 2) {
    history.splice(0, history.length - MAX_HISTORY * 2);
  }
}

// ─── Helper: call Claude ──────────────────────────────────────────────────────
async function askClaude(userId, userMessage) {
  addToHistory(userId, "user", userMessage);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: getHistory(userId),
  });

  const reply = response.content[0].text;
  addToHistory(userId, "assistant", reply);
  return reply;
}

// ─── Bot: handle /start ───────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "there";
  bot.sendMessage(chatId, `Привет, ${name}! 👋\n\nЯ ассистент экосистемы RWA NFT FI. Отвечаю на вопросы о платформе на любом языке.\n\nСпрашивай — я здесь.`);
});

// ─── Bot: handle /help ────────────────────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `📌 *RWA NFT FI Assistant*\n\n` +
    `Ask me anything about the platform:\n` +
    `• How NFTs work\n` +
    `• Smart loans (Lending)\n` +
    `• Token $DA & mining\n` +
    `• Network marketing (22 levels)\n` +
    `• CertiK audit & security\n` +
    `• DAO governance\n\n` +
    `🌍 I reply in your language automatically.\n\n` +
    `🔗 https://app.rwanftfi.com`,
    { parse_mode: "Markdown" }
  );
});

// ─── Bot: handle /reset ───────────────────────────────────────────────────────
bot.onText(/\/reset/, (msg) => {
  const userId = msg.from.id;
  histories.delete(userId);
  bot.sendMessage(msg.chat.id, "✅ Conversation reset.");
});

// ─── Bot: handle all text messages ───────────────────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userText = msg.text.trim();

  // In group chats (including forum/topic groups with threads)
  if (msg.chat.type !== "private") {
    const botInfo = await bot.getMe();
    const botUsername = botInfo.username;
    const mentionedBot = userText.includes(`@${botUsername}`);
    const repliedToBot = msg.reply_to_message?.from?.username === botUsername;
    const isFirstContact = !histories.has(userId) || getHistory(userId).length === 0;

    if (!isFirstContact && !mentionedBot && !repliedToBot) return;
  }

  bot.sendChatAction(chatId, "typing");

  try {
    const cleanText = userText.replace(/@\w+/g, "").trim();
    const reply = await askClaude(userId, cleanText || userText);

    // Build send options — support forum topic threads
    const sendOptions = {
      reply_to_message_id: msg.message_id,
      parse_mode: "Markdown",
    };
    if (msg.message_thread_id) {
      sendOptions.message_thread_id = msg.message_thread_id;
    }

    bot.sendMessage(chatId, reply, sendOptions);
  } catch (err) {
    console.error("Claude API error:", err);
    bot.sendMessage(chatId, "⚠️ Something went wrong. Please try again in a moment.");
  }
});

console.log("🤖 RWA NFT FI Bot is running...");

// Render requires an open port
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end("OK")).listen(PORT, () => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
});
