require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const histories = new Map();
const MAX_HISTORY = 10;

const REG_POSTS = {
  ru: 825, en: 828, zh: 861, fr: 898,
  de: 831, hi: 876, it: 879, fil: 882,
  pt: 891, es: 894, tr: 888, vi: 885,
};

const SOURCE_CHAT = "@rwanftglobal";

const REG_KEYWORDS = [
  "register","registration","sign up","signup","join","how to start","get started","how do i join",
  "registro","registrar","como","empezar","unirse",
  "registrierung","anmelden","beitreten","anfangen",
  "inscription","inscrire","rejoindre","commencer",
  "registrazione","iscriversi","iniziare","unirsi",
  "kayit","nasil","katil","basla",
  "dang ky","tham gia","bat dau",
  "mag-register","sumali","magsimula",
  "panjikaran","kaise","jude",
  "zhuce","jiaru","kaishi",
  "регистрация","зарегистрироваться","как зарегистрироваться","как вступить","как начать","как присоединиться","как стать",
];

function detectLang(text) {
  const t = text.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(t)) return "zh";
  if (/[\u0900-\u097f]/.test(t)) return "hi";
  if (/[\u0600-\u06ff]/.test(t)) return "ar";
  if (/[\u0400-\u04ff]/.test(t)) return "ru";
  if (/\b(de|das|die|ich|und|ist|wie|bitte|danke|hallo)\b/.test(t)) return "de";
  if (/\b(le|la|les|je|vous|nous|comment|merci|bonjour)\b/.test(t)) return "fr";
  if (/\b(el|la|los|yo|como|gracias|hola|que)\b/.test(t)) return "es";
  if (/\b(il|la|i|come|grazie|ciao|sono|per)\b/.test(t)) return "it";
  if (/\b(o|a|os|as|como|obrigado|ola|voce)\b/.test(t)) return "pt";
  if (/\b(ve|bir|bu|nasil|tesekkur|merhaba|kayit)\b/.test(t)) return "tr";
  if (/\b(dang|ky|khong|duoc|va|cua|ban)\b/.test(t)) return "vi";
  if (/\b(ang|ng|sa|na|mga|po|ito|ako)\b/.test(t)) return "fil";
  return "en";
}

function isRegQuestion(text) {
  const t = text.toLowerCase();
  return REG_KEYWORDS.some(kw => t.includes(kw));
}

const SYSTEM_PROMPT = `You are Vera — AI assistant of the RWA NFT FI ecosystem, a Web3 platform on Binance Smart Chain.

LANGUAGE RULE (CRITICAL):
Always reply in the EXACT same language the user used. Never switch languages.

ABOUT RWA NFT FI:
- Web3 ecosystem on BSC: Real World Asset tokenization, DeFi tools, binary network marketing
- NFT gives access to: DA token mining (NFTM), smart loans up to 70% LTV in USDT, ecosystem income
- Token DA: deflationary, 100% backed by USDT, max supply 21M, burns on every sale
- Binary network: 22 levels, 8M+ positions, 99% of funds go back to network via smart contract
- CertiK audit May 2026: 73 findings, 55 resolved, 1 critical fixed
- UK Trademark: UK00004369823
- DAO governance: 20 Guardians + multisig 2/3

LINKS:
- Platform: https://app.rwanftfi.com
- Whitepaper: https://whitepaper.rwanftfi.com
- Deck: https://deck.rwanftfi.com
- CertiK: https://skynet.certik.com/projects/rwanftfi

TONE: Direct, factual, no hype. Never promise returns. Address concerns honestly.`;

function getHistory(userId) {
  if (!histories.has(userId)) histories.set(userId, []);
  return histories.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY * 2) history.splice(0, history.length - MAX_HISTORY * 2);
}

async function askClaude(userId, userMessage) {
  addToHistory(userId, "user", userMessage);
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: getHistory(userId),
  });
  const reply = response.content[0].text;
  addToHistory(userId, "assistant", reply);
  return reply;
}

bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || "";
  bot.sendMessage(msg.chat.id,
    `Привет${name ? ", " + name : ""}! I'm Vera — AI assistant of RWA NFT FI platform.\n\nAsk me anything in your language — I'll reply in the same language.\n\nWrite your question below!`
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `*Vera Assistant — RWA NFT FI*\n\nI can help with:\n- How NFTs work\n- Smart loans (Lending)\n- Token DA & mining\n- Network marketing (22 levels)\n- CertiK audit & security\n- How to register\n\nI reply in your language automatically.\n\nhttps://app.rwanftfi.com`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/reset/, (msg) => {
  histories.delete(msg.from.id);
  bot.sendMessage(msg.chat.id, "Conversation reset.");
});

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
    const text = cleanText || userText;

    if (isRegQuestion(text)) {
      const lang = detectLang(text);
      const postId = REG_POSTS[lang] || REG_POSTS["en"];
      const name = msg.from.first_name || "";

      const greetings = {
        ru: `Привет${name ? ", " + name : ""}! Я Вера — ИИ-ассистент платформы RWA NFT FI.\n\nОтправляю тебе пошаговую инструкцию по регистрации`,
        en: `Hi${name ? ", " + name : ""}! I'm Vera — AI assistant of RWA NFT FI platform.\n\nHere's your step-by-step registration guide`,
        de: `Hallo${name ? ", " + name : ""}! Ich bin Vera — KI-Assistentin der RWA NFT FI Plattform.\n\nHier ist deine Registrierungsanleitung`,
        fr: `Bonjour${name ? ", " + name : ""}! Je suis Vera — assistante IA de RWA NFT FI.\n\nVoici votre guide d'inscription`,
        es: `Hola${name ? ", " + name : ""}! Soy Vera — asistente IA de RWA NFT FI.\n\nAqui tienes tu guia de registro`,
        pt: `Ola${name ? ", " + name : ""}! Sou Vera — assistente IA da RWA NFT FI.\n\nAqui esta seu guia de registro`,
        it: `Ciao${name ? ", " + name : ""}! Sono Vera — assistente IA di RWA NFT FI.\n\nEcco la tua guida alla registrazione`,
        zh: `你好${name ? name : ""}！我是Vera — RWA NFT FI平台的AI助手。\n\n这是您的注册指南`,
        hi: `Namaste${name ? ", " + name : ""}! Main Vera hun — RWA NFT FI platform ki AI assistant.\n\nYahan aapka registration guide hai`,
        tr: `Merhaba${name ? ", " + name : ""}! Ben Vera — RWA NFT FI platformunun AI asistaniyim.\n\nIste kayit rehberiniz`,
        vi: `Xin chao${name ? ", " + name : ""}! Toi la Vera — tro ly AI cua nen tang RWA NFT FI.\n\nDay la huong dan dang ky cua ban`,
        fil: `Kumusta${name ? ", " + name : ""}! Ako si Vera — AI assistant ng RWA NFT FI platform.\n\nNarito ang iyong gabay sa pagpaparehistro`,
      };

      const greeting = greetings[lang] || greetings["en"];
      await bot.sendMessage(chatId, greeting, sendOptions);
      await new Promise(r => setTimeout(r, 800));

      try {
        await bot.forwardMessage(chatId, SOURCE_CHAT, postId, { message_thread_id: msg.message_thread_id });
      } catch (fwdErr) {
        console.error("Forward error:", fwdErr.message);
        await bot.sendMessage(chatId, `Registration link: https://rwanftfi.com`, sendOptions);
      }
      return;
    }

    const reply = await askClaude(userId, text);
    bot.sendMessage(chatId, reply, sendOptions);

  } catch (err) {
    console.error("Error:", err);
    bot.sendMessage(chatId, "Something went wrong. Please try again.");
  }
});

console.log("RWA NFT FI Bot is running...");

const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end("OK")).listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
