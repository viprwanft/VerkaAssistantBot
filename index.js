require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const histories = new Map();
const MAX_HISTORY = 10;

// ─── Registration posts map: language code → message_id in @rwanftglobal ─────
const REG_POSTS = {
  ru: 825,   // Russian
  en: 828,   // English
  zh: 861,   // Chinese
  fr: 898,   // French
  de: 831,   // German
  hi: 876,   // Hindi
  it: 879,   // Italian
  fil: 882,  // Filipino
  pt: 891,   // Portuguese
  es: 894,   // Spanish
  tr: 888,   // Turkish
  vi: 885,   // Vietnamese
};

const SOURCE_CHAT = "@rwanftglobal";

// Keywords that trigger registration post forwarding
const REG_KEYWORDS = [
  // English
  "register","registration","sign up","signup","join","how to start","get started","how do i join",
  // Russian
  "регистрация","зарегистрироваться","как зарегистрироваться","как вступить","как начать","как присоединиться",
  // Spanish
  "registrar","registro","cómo unirse","empezar",
  // Portuguese
  "registrar","registro","como começar","como entrar",
  // German
  "registrieren","anmelden","wie beitreten","wie anfangen",
  // French
  "inscription","s'inscrire","comment rejoindre","commencer",
  // Italian
  "registrazione","iscriversi","come iniziare","come unirsi",
  // Turkish
  "kayıt","nasıl katılır","nasıl başlarım",
  // Chinese
  "注册","如何加入","如何开始",
  // Hindi
  "पंजीकरण","कैसे जुड़ें","शुरू कैसे करें",
  // Vietnamese
  "đăng ký","tham gia","bắt đầu",
  // Filipino
  "mag-register","sumali","paano magsimula",
];

// Detect language from text (simple heuristic by script/keywords)
function detectLang(text) {
  const t = text.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(t)) return "zh";
  if (/[\u0900-\u097f]/.test(t)) return "hi";
  if (/[\u0600-\u06ff]/.test(t)) return "ar";
  if (/[\u0e00-\u0e7f]/.test(t)) return "th";
  if (/[\u1100-\u11ff\uac00-\ud7af]/.test(t)) return "ko";
  if (/[\u3040-\u30ff]/.test(t)) return "ja";
  if (/[\u0400-\u04ff]/.test(t)) return "ru";
  if (/\b(de|das|die|ich|und|ist|wie|bitte|danke)\b/.test(t)) return "de";
  if (/\b(le|la|les|je|vous|nous|comment|merci)\b/.test(t)) return "fr";
  if (/\b(el|la|los|yo|como|gracias|hola)\b/.test(t)) return "es";
  if (/\b(il|la|i|come|grazie|ciao|sono)\b/.test(t)) return "it";
  if (/\b(o|a|os|as|como|obrigado|olá)\b/.test(t)) return "pt";
  if (/\b(ve|bir|bu|nasıl|teşekkür|merhaba)\b/.test(t)) return "tr";
  if (/\b(đăng|ký|không|được|và|của)\b/.test(t)) return "vi";
  if (/\b(ang|ng|sa|na|mga|po|ito)\b/.test(t)) return "fil";
  return "en"; // default
}

// Check if message is asking about registration
function isRegQuestion(text) {
  const t = text.toLowerCase();
  return REG_KEYWORDS.some(kw => t.includes(kw));
}

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
- Deck: https://deck.rwanftfi.com
- DAO: https://app.rwanftfi.com/dao-governance
- Smart Contracts: https://app.rwanftfi.com/smart-contracts
- CertiK Audit: https://skynet.certik.com/projects/rwanftfi

💬 TONE:
- Direct, factual, no hype
- Specific numbers over general phrases
- Never promise income or returns
- Never say "this is not a pyramid" as first response — address the actual concern

❓ COMMON QUESTIONS:
Q: "Is this a scam / pyramid?" → transparent smart contract, CertiK audit, DAO governance, UK trademark
Q: "I don't understand crypto" → step-by-step system, low entry threshold, community support
Q: "Where does money come from?" → 99% back to network via smart contract, real asset tokenization
Q: "How do smart loans work?" → deposit NFT as collateral, get up to 70% in USDT, keep the NFT
Q: "How to register?" → say "I'm sending you the registration instructions now" (bot will forward the post)`;

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

// ─── Commands ─────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || "there";
  bot.sendMessage(msg.chat.id, `Привет, ${name}! 👋\n\nЯ ассистент экосистемы RWA NFT FI. Отвечаю на вопросы о платформе на любом языке.\n\nСпрашивай — я здесь.`);
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📌 *RWA NFT FI Assistant*\n\nAsk me anything:\n• How NFTs work\n• Smart loans\n• Token $DA\n• Network marketing\n• CertiK audit\n• How to register\n\n🌍 I reply in your language.\n\n🔗 https://app.rwanftfi.com`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/reset/, (msg) => {
  histories.delete(msg.from.id);
  bot.sendMessage(msg.chat.id, "✅ Conversation reset.");
});

// ─── Main message handler ─────────────────────────────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userText = msg.text.trim();

  if (msg.chat.type !== "private") {
    const botInfo = await bot.getMe();
    const botUsername = botInfo.username;
    const mentionedBot = userText.includes(`@${botUsername}`);
    const repliedToBot = msg.reply_to_message?.from?.username === botUsername;
    const isFirstContact = !histories.has(userId) || getHistory(userId).length === 0;
    if (!isFirstContact && !mentionedBot && !repliedToBot) return;
  }

  bot.sendChatAction(chatId, "typing");

  const sendOptions = { reply_to_message_id: msg.message_id, parse_mode: "Markdown" };
  if (msg.message_thread_id) sendOptions.message_thread_id = msg.message_thread_id;

  try {
    const cleanText = userText.replace(/@\w+/g, "").trim();

    // If registration question — forward the right post + short reply
    if (isRegQuestion(cleanText || userText)) {
      const lang = detectLang(cleanText || userText);
      const postId = REG_POSTS[lang] || REG_POSTS["en"];

      try {
        await bot.forwardMessage(chatId, SOURCE_CHAT, postId, { message_thread_id: msg.message_thread_id });
      } catch (fwdErr) {
        console.error("Forward error:", fwdErr.message);
        // Fallback: send link if forward fails
        await bot.sendMessage(chatId, `🔗 Registration: https://rwanftfi.com`, sendOptions);
      }
      return;
    }

    // Regular question — ask Claude
    const reply = await askClaude(userId, cleanText || userText);
    bot.sendMessage(chatId, reply, sendOptions);

  } catch (err) {
    console.error("Error:", err);
    bot.sendMessage(chatId, "⚠️ Something went wrong. Please try again.");
  }
});

console.log("🤖 RWA NFT FI Bot is running...");

const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end("OK")).listen(PORT, () => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
});
