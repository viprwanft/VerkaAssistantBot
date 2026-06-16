require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");
const http = require("http");

// Важно: polling отключен. Бот работает в режиме Webhook + API
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const histories = new Map();
const MAX_HISTORY = 10;

const REG_POSTS = {
  ru: 825, en: 828, zh: 861, fr: 898,
  de: 831, hi: 876, it: 879, fil: 882,
  pt: 891, es: 894, tr: 888, vi: 885,
};

const SOURCE_CHAT = "@rwanftglobal";
const REF_LINKS = {
  en: 'https://app.rwanftfi.com/?ref=ProCripto',
  hi: 'https://app.rwanftfi.com/?ref=ProCripto',
  de: 'https://app.rwanftfi.com/?ref=ProCripto',
  ru: 'https://app.rwanftfi.com/?ref=ProCripto',
  zh: 'https://app.rwanftfi.com/?ref=KorzhTRAFF',
  es: 'https://app.rwanftfi.com/?ref=KorzhTRAFF',
  fr: 'https://app.rwanftfi.com/?ref=KorzhTRAFF',
  pt: 'https://app.rwanftfi.com/?ref=Korvanftfi.com/?ref=KorzhTRAFF',
  it: 'https://app.rwanftfi.com/?ref=PereudaDS',
  fil: 'https://app.rwanftfi.com/?ref=PereudaDS',
  tr: 'https://app.rwanftfi.com/?ref=PereudaDS',
  vi: 'https://app.rwanftfi.com/?ref=PereudaDS',
};

function getRefLink(lang) {
  return REF_LINKS[lang] || REF_LINKS['en'];
}

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

const SYSTEM_PROMPT = `You are Vera — AI assistant of the RWA NFT FI ecosystem on Binance Smart Chain.

LANGUAGE RULE (CRITICAL):
Always reply in the EXACT same language the user used. Never switch languages.

CRITICAL FACTS — ONLY ANSWER BASED ON THESE. NEVER INVENT OR ASSUME:

DA TOKEN:
- DA (Deflationary Asset) price can ONLY go UP. It CANNOT fall. This is by design.
- DA is 100% backed by USDT liquidity pool at all times
- Hard cap: 21,000,000 DA total — never more
- DA CANNOT be bought — it can ONLY be mined (earned) through NFT mining (NFTM process)
- Every time DA is sold: 100% of sold tokens are permanently burned + 25% protocol commission stays in pool
- This burn mechanism + fixed liquidity = price can only increase mathematically
- Biannual deflationary cycle every 6 months accelerates scarcity
- 14+ revenue streams feed the liquidity pool (NFT purchases, fees, lending, RWA income, etc.)

NFT:
- 10 tiers, price range: 28 USDT to 24,000 USDT
- NFT is the entry key to the ecosystem — unlocks mining, lending, marketing rewards
- NFT enables NFTM mining → NFTM staking → DA farming

MINING PROCESS (2 steps):
1. NFT mines NFTM token
2. NFTM is staked → produces DA

LENDING:
- Borrow up to 70% LTV against DA holdings in USDT
- Keep your NFT and DA position while getting liquidity
- Fixed rate lending protocol on-chain

MARKETING STRUCTURE:
- 22-level binary network
- Infinite compression: income from inactive partners rises to active ones
- Matching bonus: earn from partners income on 3 lines
- 8M+ total positions in the structure

SECURITY & LEGAL:
- CertiK audit completed May 2026: 73 findings, 55 resolved, 1 critical — fixed
- UK Trademark registered: UK00004369823
- DAO governance: 10M governance tokens, 20 Guardians, multisig 2/3
- Diamond Pattern (EIP-2535) smart contract architecture on BSC
- Founded in Republic of Panama

REGISTRATION LINK: use the link provided in the conversation context

LINKS:
- Platform: use the ref link from context
- Whitepaper: https://whitepaper.rwanftfi.com
- Deck: https://deck.rwanftfi.com
- CertiK: https://skynet.certik.com/projects/rwanftfi
- DAO: https://app.rwanftfi.com/dao-governance
- Smart Contracts: https://app.rwanftfi.com/smart-contracts

TONE RULES:
- Only state facts from above. If unsure — say "I recommend checking the whitepaper: https://whitepaper.rwanftfi.com"
- NEVER say DA can fall or has market risk — it structurally cannot fall by design
- NEVER say DA can be bought — it can only be mined
- NEVER invent numbers, percentages or features not listed above
- Be direct and factual, no hype
- Never promise specific income amounts`;

function getHistory(userId) {
  if (!histories.has(userId)) histories.set(userId, []);
  return histories.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY * 2) history.splice(0, history.length - MAX_HISTORY * 2);
}

async function askClaude(userId, userMessage, refLink) {
  addToHistory(userId, "user", userMessage);
  const systemWithRef = SYSTEM_PROMPT + `

REF LINK FOR THIS USER: ${refLink}
Always use this exact link when mentioning the platform or registration.`;
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: systemWithRef,
    messages: getHistory(userId),
  });
  const reply = response.content[0].text;
  addToHistory(userId, "assistant", reply);
  return reply;
}

// Выносим обработчик сообщений в отдельную функцию, чтобы вызывать её и из вебхука, и из API
async function processIncomingMessage(userId, chatId, userText, msgObjectForForwarding = null) {
  const cleanText = userText.replace(/@\w+/g, "").trim();
  const text = cleanText || userText;

  if (isRegQuestion(text)) {
    const lang = detectLang(text);
    const postId = REG_POSTS[lang] || REG_POSTS["en"];
    
    let name = "";
    if (msgObjectForForwarding && msgObjectForForwarding.from) {
      name = msgObjectForForwarding.from.first_name || "";
    }

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

    const refLink = getRefLink(lang);
    const greeting = (greetings[lang] || greetings["en"]) + `\n\n🔗 ${refLink}`;
    
    const sendOptions = { parse_mode: "Markdown" };
    if (msgObjectForForwarding && msgObjectForForwarding.message_id) {
      sendOptions.reply_to_message_id = msgObjectForForwarding.message_id;
    }
    if (msgObjectForForwarding && msgObjectForForwarding.message_thread_id) {
      sendOptions.message_thread_id = msgObjectForForwarding.message_thread_id;
    }

    await bot.sendMessage(chatId, greeting, sendOptions);
    await new Promise(r => setTimeout(r, 800));

    try {
      const fwdOptions = {};
      if (msgObjectForForwarding && msgObjectForForwarding.message_thread_id) {
        fwdOptions.message_thread_id = msgObjectForForwarding.message_thread_id;
      }
      await bot.forwardMessage(chatId, SOURCE_CHAT, postId, fwdOptions);
    } catch (fwdErr) {
      console.error("Forward error:", fwdErr.message);
      await bot.sendMessage(chatId, `Registration link: ${refLink}`, sendOptions);
    }
    return null;
  }

  const refLink = getRefLink(detectLang(text));
  return await askClaude(userId, text, refLink);
}

// Привязываем обработчик для интеграции через Webhook (для группы напрямую)
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  bot.sendChatAction(msg.chat.id, "typing");
  
  const reply = await processIncomingMessage(msg.from.id, msg.chat.id, msg.text.trim(), msg);
  if (reply) {
    const sendOptions = { reply_to_message_id: msg.message_id, parse_mode: "Markdown" };
    if (msg.message_thread_id) sendOptions.message_thread_id = msg.message_thread_id;
    bot.sendMessage(msg.chat.id, reply, sendOptions);
  }
});

// ЕДИНЫЙ ВЕБ-СЕРВЕР ДЛЯ ВСЕХ ЗАДАЧ
const PORT = process.env.PORT || 3000;
const RENDER_URL = "https://verkaassistantbot-b0uq.onrender.com";

http.createServer((req, res) => {
  // 1. Фикс для Uptime Robot (GET и HEAD)
  if (req.url === "/" || req.url === "") {
    if (req.method === "GET" || req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "text/plain", "Connection": "close" });
      res.end("OK");
      return;
    }
  }

  // 2. Роут Webhook для Группы (принимает POST-запросы напрямую от Telegram)
  if (req.url === `/bot${process.env.TELEGRAM_BOT_TOKEN}` && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const update = JSON.parse(body);
        bot.processUpdate(update);
      } catch (e) {
        console.error("Webhook error:", e.message);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // 3. Универсальный POST-роут для SendPulse API
  if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        let receivedData = {};
        try { receivedData = JSON.parse(body); } 
        catch (pErr) { receivedData = require("querystring").parse(body); }

        const userText = receivedData.text || receivedData.message || receivedData.contact_message || "";
        const userId = receivedData.user_id || receivedData.contact_id || "sendpulse_user";

        if (!userText) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ response: "No text" }));
          return;
        }

        const reply = await processIncomingMessage(userId, null, userText, null);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ response: reply, text: reply }));
      } catch (err) {
        console.error("SendPulse Route Error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
}).listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  try {
    // Включаем вебхук в Telegram для прямой работы в группе
    const webhookUrl = `${RENDER_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
    await bot.setWebHook(webhookUrl, { drop_pending_updates: true });
    console.log(`Webhook successfully set to: ${webhookUrl}`);
  } catch (e) {
    console.error("Webhook activation error:", e.message);
  }
});
