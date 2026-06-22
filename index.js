require("dotenv").config();

// Never let an unhandled promise rejection crash the whole process —
// just log it and keep the bot running.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (caught, not crashing):", reason && reason.message ? reason.message : reason);
});
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");
const http = require("http");
const fs = require("fs");
const path = require("path");
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 90 * 1000, // 90s timeout per request
  maxRetries: 3,      // SDK's own retry logic handles transient network errors
});
const histories = new Map();
const MAX_HISTORY = 10;
const welcomedUsers = new Set();
// Users who just joined but haven't written their first message yet.
// We wait for their first message to detect their language reliably.
const pendingWelcome = new Map(); // userId -> { chatId, name, joinedAt }
// Hardcoded video file_ids per language — survives deploys (unlike the local JSON file).
// Fill these in once you have the file_id for each language (sent via bot confirmation).
// Leave empty string "" for languages without a video yet — bot will fall back to text-only.
const WELCOME_VIDEOS_FIXED = {
  ru: "BAACAgIAAxkBAAPbajK30h1JR0qBA-BN2f7olUJGmQQAAmumAAJzn5hJwdvLnj8wZN48BA",
  en: "BAACAgIAAxkBAAPZajK3aSPoL6JzySWW02fCaZXFVzgAAmamAAJzn5hJA0ZpVDT-xgABPAQ",
  de: "BAACAgIAAxkBAAPdajK4XSjw54jAcca1cHgILguTBDMAAnOmAAJzn5hJukx0g30R7HQ8BA",
  hi: "BAACAgIAAxkBAAPlajK5aDrXnVdiBGmr3tZ8ZJCNDjQAAn-mAAJzn5hJcqARGyWY6Ec8BA",
  zh: "BAACAgIAAxkBAAPpajK51S6xYnH-kEfFQ0jMYaKTDMAAAommAAJzn5hJr9JkOZgRqRs8BA",
  es: "BAACAgIAAxkBAAPfajK4o_2H12I0klTFpU8sBFx5gJkAAnWmAAJzn5hJ56GCsu_TbW88BA",
  fr: "BAACAgIAAxkBAAPtajK6QehRtFxYNGgBZAbJrVnqCXIAAo6mAAJzn5hJrj3QFcReU0g8BA",
  pt: "BAACAgIAAxkBAAPnajK5qvr-l6mevSOwov3nQjKb3oYAAoemAAJzn5hJsD8fbGaSgvc8BA",
  it: "BAACAgIAAxkBAAPhajK44yHkmGKKJ_kjsUtcV_G00xkAAnemAAJzn5hJx859AiNJF-I8BA",
  fil: "BAACAgIAAxkBAAPjajK5MHbSVwQNwW4DMZMMsmpYhz4AAnmmAAJzn5hJAilngcaz22M8BA",
  tr: "BAACAgIAAxkBAAPrajK6Eb7nhXSZhBZ9-xX7RRcFpbAAAoymAAJzn5hJXYOsnIvXdHw8BA",
  vi: "BAACAgIAAxkBAAPvajK6aF3Skwm2BiEyoAxwou3XKU8AApKmAAJzn5hJqh0ewffBmBk8BA",
};

const VIDEO_DB_PATH = path.join(__dirname, "welcome_videos.json");
let welcomeVideos = {};
if (fs.existsSync(VIDEO_DB_PATH)) {
  try { welcomeVideos = JSON.parse(fs.readFileSync(VIDEO_DB_PATH, "utf8")); } catch (e) { welcomeVideos = {}; }
}
// Merge: hardcoded values take priority once filled in, JSON file acts as a temporary fallback
for (const lang in WELCOME_VIDEOS_FIXED) {
  if (WELCOME_VIDEOS_FIXED[lang]) welcomeVideos[lang] = WELCOME_VIDEOS_FIXED[lang];
}
const REF_LINKS = {
  en: 'https://app.rwanftfi.com/?ref=ProCripto',
  hi: 'https://app.rwanftfi.com/?ref=ProCripto',
  de: 'https://app.rwanftfi.com/?ref=ProCripto',
  ru: 'https://app.rwanftfi.com/?ref=ProCripto',
  zh: 'https://app.rwanftfi.com/?ref=KorzhTRAFF',
  es: 'https://app.rwanftfi.com/?ref=KorzhTRAFF',
  fr: 'https://app.rwanftfi.com/?ref=KorzhTRAFF',
  pt: 'https://app.rwanftfi.com/?ref=KorzhTRAFF',
  it: 'https://app.rwanftfi.com/?ref=PereudaDS',
  fil: 'https://app.rwanftfi.com/?ref=PereudaDS',
  tr: 'https://app.rwanftfi.com/?ref=PereudaDS',
  vi: 'https://app.rwanftfi.com/?ref=PereudaDS',
};

// Map forum thread_id (branch) -> language code.
// IMPORTANT: fill these in with your real thread IDs for each language branch in the group.
const THREAD_LANG = {
  3: 'ru', 5: 'en', 7: 'zh', 9: 'fr',
  11: 'de', 13: 'hi', 15: 'it', 17: 'fil',
  19: 'pt', 21: 'es', 23: 'tr', 25: 'vi',
};

const WELCOME_TEXTS = {
  ru: `👋 Привет, <b>{name}</b>! Добро пожаловать в <b>RWA NFT FI</b> 🌍\n\n🤖 Я Вера, ИИ-ассистент проекта. Помогу тебе быстро освоиться на платформе, найти команду для развития и запустить свой доход на майнинге.\n\n💎 <b>NFT</b> майнит токен DA — актив, который может только расти в цене\n💰 <b>Кредитование</b> под залог до 70% от стоимости\n🌐 <b>Сеть</b> из 8M+ участников с бесконечной компрессией\n\n<b>🚀 С чего начать прямо сейчас?</b>\nИзучи наш закреп и посмотри короткое видео выше.\n\nЕсли появятся любые вопросы по платформе или токенам — пиши прямо сюда ⬇️ Я всегда в сети и отвечу за секунду!`,
  en: `👋 Hi, <b>{name}</b>! Welcome to <b>RWA NFT FI</b> 🌍\n\n🤖 I'm Vera, the AI assistant. I'll help you get started on the platform, find a team for growth, and launch your mining income.\n\n💎 <b>NFT</b> mines the DA token — an asset that can only grow in value\n💰 Lending with up to 70% collateral\n🌐 Network of 8M+ members with infinite compression\n\n🚀 Where to start right now?\nCheck out our pinned message and watch the short video above.\n\nIf you have any questions about the platform or tokens — drop them right here ⬇️ I'm always online and will reply in a second!`,
  de: `👋 Hallo, <b>{name}</b>! Willkommen bei <b>RWA NFT FI</b> 🌍\n\n🤖 Ich bin Vera, die KI-Assistentin des Projekts. Ich helfe dir, dich schnell auf der Plattform zurechtzufinden, ein Team für die Entwicklung aufzubauen und dein Mining-Einkommen zu starten.\n\n💎 <b>NFT</b> mined den DA-Token — ein Vermögenswert, der nur wachsen kann\n💰 Kredit mit bis zu 70% Sicherheiten\n🌐 Netzwerk mit 8M+ Mitgliedern mit unendlicher Kompression\n\n🚀 Wo soll man jetzt anfangen?\nLies unsere angepinnte Nachricht und schau dir das kurze Video oben an.\n\nWenn du Fragen hast — schreibe direkt hier ⬇️ Ich bin immer online und antworte sofort!`,
  fr: `👋 Bonjour, <b>{name}</b>! Bienvenue chez <b>RWA NFT FI</b> 🌍\n\n🤖 Je suis Vera, l'assistante IA du projet. Je t'aiderai à te familiariser rapidement avec la plateforme, à trouver une équipe et à lancer tes revenus de mining.\n\n💎 <b>NFT</b> mine le token DA — un actif qui ne peut que croître\n💰 Crédit avec jusqu'à 70% de garantie\n🌐 Réseau de 8M+ membres avec compression infinie\n\n🚀 Par quoi commencer dès maintenant ?\nConsulte notre message épinglé et regarde la courte vidéo ci-dessus.\n\nSi tu as des questions — écris directement ici ⬇️ Je suis toujours en ligne et te répondrai en une seconde!`,
  es: `👋 ¡Hola, <b>{name}</b>! Bienvenido a <b>RWA NFT FI</b> 🌍\n\n🤖 Soy Vera, la asistente de IA del proyecto. Te ayudaré a familiarizarte con la plataforma, encontrar un equipo y lanzar tus ingresos de minería.\n\n💎 <b>NFT</b> minea el token DA — un activo que solo puede crecer\n💰 Préstamos con hasta el 70% de garantía\n🌐 Red de 8M+ miembros con compresión infinita\n\n🚀 ¿Por dónde empezar ahora mismo?\nRevisa nuestro mensaje fijado y mira el breve video de arriba.\n\nSi tienes preguntas — escríbelas directamente aquí ⬇️ ¡Siempre estoy en línea y te responderé en un segundo!`,
  pt: `👋 Olá, <b>{name}</b>! Bem-vindo ao <b>RWA NFT FI</b> 🌍\n\n🤖 Sou Vera, a assistente de IA do projeto. Vou te ajudar a começar na plataforma, encontrar uma equipe e lançar sua renda com mineração.\n\n💎 <b>NFT</b> minera o token DA — um ativo que só pode crescer\n💰 Empréstimos com até 70% de garantia\n🌐 Rede de 8M+ membros com compressão infinita\n\n🚀 Por onde começar agora mesmo?\nConfira nossa mensagem fixada e assista ao breve vídeo acima.\n\nSe tiver dúvidas — escreva direto aqui ⬇️ Estou sempre online e te respondo em um segundo!`,
  it: `👋 Ciao, <b>{name}</b>! Benvenuto in <b>RWA NFT FI</b> 🌍\n\n🤖 Sono Vera, l'assistente IA del progetto. Ti aiuterò a orientarti sulla piattaforma, trovare un team e avviare la tua rendita dal mining.\n\n💎 <b>NFT</b> mina il token DA — un asset che può solo crescere\n💰 Prestiti con fino al 70% di garanzia\n🌐 Rete di 8M+ membri con compressione infinita\n\n🚀 Da dove iniziare adesso?\nDai un'occhiata al nostro messaggio in evidenza e guarda il breve video sopra.\n\nSe hai domande — scrivile direttamente qui ⬇️ Sono sempre online e ti risponderò in un secondo!`,
  zh: `👋 你好，<b>{name}</b>！欢迎来到 <b>RWA NFT FI</b> 🌍\n\n🤖 我是维拉（Vera），项目的 AI 助手。我将帮助您快速熟悉平台、找到发展团队并开启挖矿收益。\n\n💎 <b>NFT</b> 挖掘 DA 代币 — 只涨不跌的资产\n💰 贷款 最高抵押 70%\n🌐 网络 拥有 800万+ 成员，无限压缩\n\n🚀 现在该如何开始？\n请查看我们的置顶消息并观看上方的短视频。\n\n如有任何疑问 — 请直接在这里发送 ⬇️ 我一直在线，会在一秒钟内回复您！`,
  fil: `👋 Hi, <b>{name}</b>! Maligayang pagdating sa <b>RWA NFT FI</b> 🌍\n\n🤖 Ako si Vera, ang AI assistant ng proyekto. Tutulungan kitang magsimula sa platform, makahanap ng koponan at simulan ang kita sa mining.\n\n💎 <b>NFT</b> nagmimina ng DA token — asset na pataas lang\n💰 Pautang hanggang 70% na collateral\n🌐 Network ng 8M+ miyembro na may walang hanggang compression\n\n🚀 Saan magsisimula ngayon?\nTingnan ang aming pinned message at panoorin ang maikling video sa itaas.\n\nKung may mga tanong — i-drop dito mismo ⬇️ Laging akong online at sasagutin kita sa isang segundo!`,
  tr: `👋 Merhaba, <b>{name}</b>! <b>RWA NFT FI</b>'ya hoş geldin 🌍\n\n🤖 Ben Vera, projenin yapay zeka asistanıyım. Platformda yön bulmana, ekip bulmana ve madencilik gelirini başlatmana yardımcı olacağım.\n\n💎 <b>NFT</b> DA token madenciliği yapar — sadece değer kazanan bir varlık\n💰 Kredi %70'e kadar teminatla\n🌐 Ağ sonsuz sıkıştırmalı 8M+ üyeyle\n\n🚀 Şimdi nereden başlamalı?\nSabitlenmiş mesajımıza göz at ve yukarıdaki kısa videoyu izle.\n\nSoruların varsa — doğrudan buraya yaz ⬇️ Her zaman çevrimiçiyim ve bir saniye içinde cevap vereceğim!`,
  vi: `👋 Xin chào, <b>{name}</b>! Chào mừng đến với <b>RWA NFT FI</b> 🌍\n\n🤖 Tôi là Vera, trợ lý AI của dự án. Tôi sẽ giúp bạn làm quen với nền tảng, tìm nhóm phát triển và bắt đầu thu nhập từ khai thác.\n\n💎 <b>NFT</b> khai thác token DA — tài sản chỉ tăng không giảm\n💰 Cho vay với tài sản thế chấp lên đến 70%\n🌐 Mạng lưới 8M+ thành viên với nén vô hạn\n\n🚀 Bắt đầu từ đâu ngay bây giờ?\nHãy xem tin nhắn được ghim và xem video ngắn ở trên.\n\nNếu có câu hỏi — hãy viết trực tiếp vào đây ⬇️ Tôi luôn trực tuyến và sẽ trả lời trong vòng một giây!`,
  hi: `👋 नमस्ते, <b>{name}</b>! <b>RWA NFT FI</b> में आपका स्वागत है 🌍\n\n🤖 मैं वेरा हूं, प्रोजेक्ट की AI सहायक। मैं आपको प्लेटफ़ॉर्म पर शुरुआत करने, टीम खोजने और माइनिंग आय शुरू करने में मदद करूंगी।\n\n💎 <b>NFT</b> DA टोकन माइन करता है — केवल बढ़ने वाला एसेट\n💰 लोन 70% तक संपार्श्विक के साथ\n🌐 नेटवर्क अनंत कम्प्रेशन के साथ 8M+ सदस्य\n\n🚀 अभी कहां से शुरू करें?\nहमारा पिन किया गया संदेश देखें और ऊपर दिया गया छोटा वीडियो देखें।\n\nकोई प्रश्न हो तो — सीधे यहीं लिखें ⬇️ मैं हमेशा ऑनलाइन हूं और एक सेकंड में जवाब दूंगी!`
};

function getRefLink(lang) { return REF_LINKS[lang] || REF_LINKS['en']; }

function getLangByThread(threadId) {
  return THREAD_LANG[threadId] || null;
}

// Map a Telegram language_code (e.g. "en", "en-US", "pt-BR") to one of our supported langs
function normalizeLangCode(languageCode) {
  if (!languageCode) return "en";
  const code = languageCode.toLowerCase().split("-")[0];
  return WELCOME_TEXTS[code] ? code : "en";
}

const REG_KEYWORDS = [
  // Registration
  "регистрация", "зарегистрироваться", "как начать", "ссылка", "инструкция", "вайтлист",
  "register", "registration", "sign up", "signup", "join", "get started", "link",
  // Documents & security
  "whitepaper", "белый лист", "вайтпейпер", "документ", "certik", "сертик", "аудит", "audit",
  "смарт контракт", "smart contract", "токеномика", "tokenomics", "dao", "governance",
  "trademark", "товарный знак", "brandbook", "брендбук",
  // Italian/Spanish/French/German/etc equivalents
  "documento", "libro blanco", "registrazione", "registrarse", "enregistrement",
  "dokument", "weissbuch", "registrierung"
];

// Store detected language per user so ref link stays consistent across conversation
const userLangs = new Map();

function detectLang(text) {
  const t = text.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(t)) return "zh";
  if (/[\u0900-\u097f]/.test(t)) return "hi";
  if (/[\u0400-\u04ff]/.test(t)) return "ru";
  if (/\b(de|das|die|der)\b/.test(t)) return "de";
  if (/\b(le|la|les|du|est)\b/.test(t)) return "fr";
  if (/\b(el|la|los|las|es|en)\b/.test(t)) return "es";
  if (/\b(il|la|lo|gli|le|è)\b/.test(t)) return "it";
  if (/\b(o|a|os|as|de|do)\b/.test(t)) return "pt";
  if (/\b(ve|bir|bu|için|ile)\b/.test(t)) return "tr";
  if (/\b(và|của|là|được|trong)\b/.test(t)) return "vi";
  if (/\b(ang|ng|mga|sa|na|at)\b/.test(t)) return "fil";
  return "en";
}
function isRegQuestion(text) {
  const t = text.toLowerCase();
  return REG_KEYWORDS.some(kw => t.includes(kw));
}
const SYSTEM_PROMPT = `You are Vera — a warm, human-like AI assistant of the RWA NFT FI ecosystem on Binance Smart Chain.

CRITICAL FORMATTING RULES:
- Never use markdown symbols like *, #, __, ~~, \`, or bullet points with dashes
- For emphasis use ONLY Telegram HTML: <b>important text</b> for bold
- Write in a natural, conversational human voice — like a knowledgeable friend, not a robot
- Use short paragraphs, plain sentences, and occasional emojis to feel warm and alive
- No lists with dashes or asterisks — write in flowing sentences instead
- When sharing multiple points, integrate them naturally into sentences

PERSONA:
- You are Vera, a passionate believer in the RWA NFT FI project
- You speak warmly, confidently, and clearly
- You answer in the same language the user writes in
- You never say you are an AI unless directly asked

KEY FACTS (never contradict these):
- DA token can ONLY increase in price mathematically — it NEVER falls
- NFTs are the only way to mine DA tokens (you cannot buy DA directly)
- DA token is 100% backed by USDT in smart contracts
- Max supply: 21 million DA tokens
- DA tokens are burned when sold — this is what makes the price only go up
- NFT tiers: 10 levels from 28 USDT to 24,000 USDT
- Lending: borrow up to 70% LTV in USDT against your DA tokens
- Marketing: 22-level binary network, 8M+ positions, infinite compression, matching bonus
- CertiK audit May 2026: 73 findings, 55 resolved, 1 critical fixed
- UK Trademark: UK00004369823

IMPORTANT LINKS (always share when relevant, never say "search for it yourself"):
- Resources hub (videos, PDFs, all materials): https://app.rwanftfi.com/resources
- Whitepaper (full technical documentation): https://whitepaper.rwanftfi.com
- Brandbook (brand identity): https://brandbook.rwanftfi.com
- Presentation/Deck: https://deck.rwanftfi.com
- Smart Contracts: https://app.rwanftfi.com/smart-contracts
- DAO Governance: https://app.rwanftfi.com/dao-governance
- Terms & Conditions: https://app.rwanftfi.com/terms
- CertiK security audit: https://skynet.certik.com/projects/rwanftfi
- UK Trademark certificate: https://trademarks.ipo.gov.uk/ipo-tmcase/page/Results/1/UK00004369823

REGISTRATION LINK: When user wants to register or join — use ONLY the personal link provided at the end of this prompt. Do NOT use any other link for registration.

RULE: When someone asks about any document, security, audit, trademark, whitepaper, presentation, or any material — ALWAYS give the direct link from the list above. Never tell them to search for it themselves.`;

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
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT + `\n\nREGISTRATION LINK FOR THIS USER (use this exact link when user asks to register or join the platform): ${refLink}`,
      messages: getHistory(userId),
    });
    const reply = response.content[0].text;
    addToHistory(userId, "assistant", reply);
    return reply;
  } catch (err) {
    console.error(`askClaude failed: ${err.message}`);
    // Remove the failed user message from history to avoid corrupted state
    const history = getHistory(userId);
    if (history.length > 0 && history[history.length - 1].role === "user") history.pop();
    throw err;
  }
}
async function processIncomingMessage(userId, chatId, userText) {
  const text = userText.replace(/@\w+/g, "").trim();

  // Detect language and save it per user — so ref link stays consistent
  // even when short messages can't be reliably detected
  const detectedLang = detectLang(text);
  if (detectedLang !== "en") {
    // Only update saved lang if we detected something specific (not default "en")
    userLangs.set(userId, detectedLang);
  }
  const lang = userLangs.get(userId) || detectedLang;
  const refLink = getRefLink(lang);

  if (isRegQuestion(text)) {
    return await askClaude(userId, `The user asks about a document, registration, or wants links. Reply in their language and share the relevant links:\n- Platform (to register): ${refLink}\n- Whitepaper: https://whitepaper.rwanftfi.com\n- CertiK audit: https://skynet.certik.com/projects/rwanftfi\n- Smart Contracts: https://app.rwanftfi.com/smart-contracts`, refLink);
  }
  return await askClaude(userId, text, refLink);
}

// userObj = the Telegram user who joined. threadId = forum branch they joined in (if any).
async function triggerDirectWelcome(chatId, userObj, threadId) {
  if (!userObj || userObj.is_bot) return;
  const userId = userObj.id;
  if (welcomedUsers.has(userId)) return;
  welcomedUsers.add(userId);

  const name = userObj.first_name || "User";

  // language_code is not sent in chat_member events (lang=none confirmed via logs).
  // Try getChat — works if user has previously messaged the bot in private.
  try {
    const userInfo = await bot.getChat(userId);
    if (userInfo && userInfo.language_code) {
      const lang = normalizeLangCode(userInfo.language_code);
      console.log(`[WELCOME SEND IMMEDIATE] userId=${userId} name=${name} lang=${lang} via getChat`);
      await sendWelcome(chatId, userId, name, lang, null);
      return;
    }
  } catch (err) {
    console.log(`[WELCOME getChat failed] userId=${userId}: ${err.message}`);
  }

  // getChat didn't have language_code — wait for first message to detect language
  pendingWelcome.set(userId, { chatId, name, joinedAt: Date.now() });
  console.log(`[WELCOME PENDING] userId=${userId} name=${name} — waiting for first message`);

  // After 10 minutes of silence — send English as last resort
  setTimeout(() => {
    if (pendingWelcome.has(userId)) {
      pendingWelcome.delete(userId);
      sendWelcome(chatId, userId, name, "en", null);
      console.log(`[WELCOME FALLBACK en] userId=${userId} — sent after 10min timeout`);
    }
  }, 10 * 60 * 1000);
}

// Send the actual welcome message + video once we know the user's language.
async function sendWelcome(chatId, userId, name, lang, threadId) {
  const rawText = (WELCOME_TEXTS[lang] || WELCOME_TEXTS.en).replace("{name}", name);
  const sendOptions = { parse_mode: "HTML" };
  if (threadId) sendOptions.message_thread_id = threadId;

  if (welcomeVideos[lang]) {
    try {
      await bot.sendVideo(chatId, welcomeVideos[lang], { ...sendOptions, caption: rawText });
    } catch (err) {
      console.error("sendWelcome video error:", err.message);
      await bot.sendMessage(chatId, rawText, sendOptions).catch(e => console.error("sendWelcome text error:", e.message));
    }
  } else {
    await bot.sendMessage(chatId, rawText, sendOptions).catch(e => console.error("sendWelcome text error:", e.message));
  }
}

bot.on("message", async (msg) => {
  if (msg.new_chat_members || msg.left_chat_member) return;
  if (msg.chat.type === "private" && msg.video) {
    const fileName = msg.video.file_name ? msg.video.file_name.toLowerCase() : "";
    let detectedLang = null;
    if (/[\u4e00-\u9fff]/.test(fileName) || fileName.includes("chinese") || fileName.includes("zh")) detectedLang = "zh";
    else if (/[\u0900-\u097f]/.test(fileName) || fileName.includes("hindi") || fileName.includes("hi")) detectedLang = "hi";
    else if (/[а-яА-ЯёЁ]/.test(fileName) || fileName.includes("russian") || fileName.includes("ru")) detectedLang = "ru";
    else if (fileName.includes("về") || fileName.includes("vi")) detectedLang = "vi";
    else if (fileName.includes("hakkında") || fileName.includes("tr")) detectedLang = "tr";
    else if (fileName.includes("sobre_a") || fileName.includes("pt")) detectedLang = "pt";
    else if (fileName.includes("sobre_la") || fileName.includes("es")) detectedLang = "es";
    else if (fileName.includes("sulla") || fileName.includes("it")) detectedLang = "it";
    else if (fileName.includes("german") || fileName.includes("de")) detectedLang = "de";
    else if (fileName.includes("french") || fileName.includes("fr")) detectedLang = "fr";
    else if (fileName.includes("filipino") || fileName.includes("fil")) detectedLang = "fil";
    if (detectedLang) {
      welcomeVideos[detectedLang] = msg.video.file_id;
      fs.writeFileSync(VIDEO_DB_PATH, JSON.stringify(welcomeVideos, null, 2), "utf8");
      bot.sendMessage(
        msg.chat.id,
        `✅ Видео для языка ${detectedLang.toUpperCase()} сохранено!\n\nfile_id (скопируй и пришли мне в чат):\n${msg.video.file_id}`
      ).catch(err => console.error("Confirm message error:", err.message));
      return;
    }
    // If language could not be detected from the file name, still show the file_id
    // so it can be manually mapped to a language.
    bot.sendMessage(
      msg.chat.id,
      `⚠️ Не удалось определить язык по названию файла.\n\nfile_id (скопируй и пришли мне, укажи язык вручную):\n${msg.video.file_id}`
    ).catch(err => console.error("Confirm message error:", err.message));
    return;
  }
  if (!msg.text || msg.text.startsWith("/")) return;

  // Temporary debug log: shows the real thread_id for each branch when someone writes in it.
  if (msg.chat.type !== "private") {
    console.log(`[THREAD DEBUG] chat=${msg.chat.id} thread_id=${msg.message_thread_id} text="${msg.text.slice(0, 30)}"`);
  }

  // If this is the user's first message after joining — send the welcome now that we know their language.
  if (msg.from && pendingWelcome.has(msg.from.id)) {
    const pending = pendingWelcome.get(msg.from.id);
    pendingWelcome.delete(msg.from.id);
    const lang = detectLang(msg.text);
    console.log(`[WELCOME SEND] userId=${msg.from.id} name=${pending.name} lang=${lang} — first message detected`);
    await sendWelcome(pending.chatId, msg.from.id, pending.name, lang, msg.message_thread_id || null);
  }

  bot.sendChatAction(msg.chat.id, "typing");

  // SDK already retries internally (maxRetries: 2). Just one outer retry as a safety net.
  let reply = null;
  try {
    reply = await processIncomingMessage(msg.from.id, msg.chat.id, msg.text.trim());
  } catch (err) {
    console.error(`Message handler attempt 1 failed: ${err.message}`);
    try {
      await new Promise(r => setTimeout(r, 3000));
      bot.sendChatAction(msg.chat.id, "typing").catch(() => {});
      reply = await processIncomingMessage(msg.from.id, msg.chat.id, msg.text.trim());
    } catch (err2) {
      console.error(`Message handler attempt 2 failed: ${err2.message}`);
    }
  }

  if (reply) {
    const sendOptions = { reply_to_message_id: msg.message_id, parse_mode: "HTML" };
    if (msg.message_thread_id) sendOptions.message_thread_id = msg.message_thread_id;
    bot.sendMessage(msg.chat.id, reply, sendOptions).catch(err => console.error("sendMessage error:", err.message));
  }
});
const PORT = process.env.PORT || 3000;
const RENDER_URL = "https://verkaassistantbot-b0uq.onrender.com";
http.createServer((req, res) => {
  if (req.url === `/bot${process.env.TELEGRAM_BOT_TOKEN}` && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const update = JSON.parse(body);
        // This group does NOT send the classic new_chat_members service message at all —
        // confirmed via getUpdates: only chat_member events are sent, because Group Help's
        // captcha flow puts new users into "restricted" first, then promotes them to "member"
        // once they pass the captcha. So we treat THAT specific transition as "joined".
        if (update.message && update.message.new_chat_members) {
          const chatId = update.message.chat.id;
          const threadId = update.message.message_thread_id;
          const adder = update.message.from; // who triggered this service message
          console.log(`[JOIN DEBUG via message] chat=${chatId} thread_id=${threadId} new_members=${update.message.new_chat_members.map(m => `${m.first_name}(lang=${m.language_code || "none"})`).join(",")}`);
          for (const memberUser of update.message.new_chat_members) {
            const joinedBySelf = adder && memberUser && adder.id === memberUser.id;
            if (joinedBySelf) {
              await triggerDirectWelcome(chatId, memberUser, threadId);
            }
          }
        }

        if (update.chat_member) {
          const chatId = update.chat_member.chat.id;
          const oldStatus = update.chat_member.old_chat_member && update.chat_member.old_chat_member.status;
          const newStatus = update.chat_member.new_chat_member && update.chat_member.new_chat_member.status;
          const memberUser = update.chat_member.new_chat_member && update.chat_member.new_chat_member.user;
          console.log(`[JOIN DEBUG via chat_member] chat=${chatId} user=${memberUser ? memberUser.first_name : "?"} lang=${memberUser ? (memberUser.language_code || "none") : "?"} ${oldStatus} -> ${newStatus} (changed_by=${update.chat_member.from ? update.chat_member.from.first_name : "?"})`);

          // Only trigger welcome when Group Help promotes the user from "restricted" to "member"
          // — that's the exact moment they passed the captcha. Ignore earlier transitions
          // like "left -> member" which happen before Group Help has processed them.
          const captchaPassed = newStatus === "member"
            && oldStatus === "restricted"
            && update.chat_member.from
            && update.chat_member.from.is_bot;
          if (captchaPassed && memberUser && !memberUser.is_bot) {
            await triggerDirectWelcome(chatId, memberUser, null);
          }
        }

        bot.processUpdate(update);
      } catch (e) {
        console.error("Webhook processing error:", e.message);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(200); res.end("OK");
}).listen(PORT, async () => {
  try {
    await bot.setWebHook(`${RENDER_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`, {
      drop_pending_updates: true,
      allowed_updates: ["message", "chat_member", "callback_query"]
    });
  } catch (e) {}
});
