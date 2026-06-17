require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");
const http = require("http");
const fs = require("fs");
const path = require("path");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const histories = new Map();
const MAX_HISTORY = 10;

const VIDEO_DB_PATH = path.join(__dirname, "welcome_videos.json");
let welcomeVideos = {};
if (fs.existsSync(VIDEO_DB_PATH)) {
  try { welcomeVideos = JSON.parse(fs.readFileSync(VIDEO_DB_PATH, "utf8")); } catch (e) { welcomeVideos = {}; }
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

const WELCOME_TEXTS = {
  ru: `Привет, **{name}**! Добро пожаловать в **RWA NFT FI** 🌍\n\nЯ Вера, ИИ-ассистент проекта. Помогу тебе быстро освоиться на платформе, найти команду для развития и запустить свой доход на майнинге.\n\n**С чего начать прямо сейчас?**\nИзучи наш закреп и посмотри короткое video выше.\n\nЕсли появятся любые вопросы по платформе или токенам — **пиши их прямо сюда, в чат**. Я всегда в сети и отвечу тебе за секунду! 🚀`,
  en: `Hi, **{name}**! Welcome to **RWA NFT FI** 🌍\n\nI'm Vera, the AI assistant. I'll help you get started on the platform, find a team for growth, and launch your mining income.\n\n**Where to start right now?**\nCheck out our pinned message and watch the short video above.\n\nIf you have any questions about the platform or tokens, **drop them right here in the chat**. I'm always online and will reply in a second! 🚀`,
  de: `Hallo, **{name}**! Willkommen bei **RWA NFT FI** 🌍\n\nIch bin Vera, die KI-Assistentin des Projekts. Ich helfe dir, dich schnell auf der Plattform zurechtzufinden, ein Team für die Entwicklung aufzubauen und dein Mining-Einkommen zu starten.\n\n**Wo soll man jetzt anfangen?**\nLies unsere angepinnte Nachricht und schau dir das kurze Video oben an.\n\nWenn du Fragen zur Plattform oder zu den Token hast — **schreibe sie direkt hier in den Chat**. Ich bin immer online und antworte dir sofort! 🚀`,
  fr: `Bonjour, **{name}**! Bienvenue chez **RWA NFT FI** 🌍\n\nJe suis Vera, l'assistante IA du projet. Je t'aiderai à te familiariser rapidement avec la plateforme, à trouver une équipe pour te développer et à lancer tes revenus de mining.\n\n**Par quoi commencer dès maintenant ?**\nConsulte our message épinglé et regarde la courte vidéo ci-dessus.\n\nSi tu as des questions sur la plateforme ou les tokens — **écris-les directement ici dans le chat**. Je suis toujours en ligne et je te répondrai en une seconde ! 🚀`,
  es: `¡Hola, **{name}**! Bienvenido a **RWA NFT FI** 🌍\n\nSoy Vera, la asistente de IA del proyecto. Te ayudaré a familiarizarte rápidamente con la plataforma, encontrar un equipo para desarrollarte y lanzar tus ingresos de minería.\n\n**¿Por dónde empezar ahora mismo?**\nRevisa nuestro mensaje fijado y mira el breve video de arriba.\n\nSi tienes alguna pregunta sobre la plataforma o los tokens, **escríbela directamente aquí en el chat**. ¡Siempre estoy en línea y te responderé en un segundo! 🚀`,
  pt: `Olá, **{name}**! Bem-vindo ao **RWA NFT FI** 🌍\n\nSou Vera, a assistente de IA do projeto. Vou te ajudar a se ambientar rapidamente na plataforma, encontrar uma equipe para evoluir e lançar sua renda com mineração.\n\n**Por onde começar agora mesmo?**\nConfira nossa mensagem fixada e assista ao breve vídeo acima.\n\nSe tiver qualquer dúvida sobre a pf ou tokens — **escreva direto aqui no chat**. Estou sempre online e te respondo em um segundo! 🚀`,
  it: `Ciao, **{name}**! Benvenuto in **RWA NFT FI** 🌍\n\nSono Vera, l'assistente IA del progetto. Ti aiuterò a orientarti rapidamente sulla piattaforma, trovare un team per crescere e avviare la tua rendita dal mining.\n\n**Da dove iniziare adesso?**\nDai un'occhiata al nostro messaggio in evidenza e guarda il breve video sopra.\n\nSe hai domande sulla piattaforma o sui token — **scrivile direttamente qui in chat**. Sono sempre online e ti risponderò in un secondo! 🚀`,
  zh: `你好，**{name}**！欢迎来到 **RWA NFT FI** 🌍\n\n我是维拉（Vera），项目的 AI 助手。我将帮助您快速熟悉平台、找到共同发展的团队并开启您的挖矿收益。\n\n**现在该如何开始？**\n请查看我们的置顶消息并观看上方的短视频。\n\n如果您对平台或代币有任何疑问 — **请直接在聊天中发送**。我一直在线，会在一秒钟内回复您！🚀`,
  fil: `Hi, **{name}**! Maligayang pagdating sa **RWA NFT FI** 🌍\n\nAko si Vera, ang AI assistant ng proyekto. Tutulungan kitang mabilis na masanay sa platform, makahanap ng koponan para sa paglago, at simulan ang iyong kita sa mining.\n\n**Saan magsisimula ngayon?**\nTingnan ang aming pinned message at panoorin ang maikling video sa itaas.\n\nKung mayroon kang anumang mga katanungan tungkol sa platform o tokens — **i-drop ang mga ito dito mismo sa chat**. Laging akong online at sasagutin kita sa loob ng isang segundo! 🚀`,
  tr: `Merhaba, **{name}**! **RWA NFT FI** topluluğuna hoş geldin 🌍\n\nBen Vera, projenin yapay zeka asistanıyım. Platforma hızla alışmana, gelişim için bir ekip bulmana ve madencilik geliri elde etmene yardımcı olacağım.\n\n**Şu an nereden başlamalısın?**\nYönlendirilmiş mesajımızı incele ve yukarıdaki kısa videoyu izle.\n\nPlatform veya tokenlar hakkında herhangi bir sorun olursa — **doğrudan buraya, chata yaz**. Her an çevrimiçiyim ve bir saniyede cevap veririm! 🚀`,
  vi: `Chào **{name}**! Chào mừng bạn đến với **RWA NFT FI** 🌍\n\nTôi là Vera, trợ lý AI của dự án. Tôi sẽ giúp bạn nhanh chóng làm quen với nền tảng, tìm đội ngũ để cùng phát triển và bắt đầu thu nhập từ khai thác (mining).\n\n**Bắt đầu từ đâu ngay bây giờ?**\nHãy xem tin nhắn ghim của chúng tôi và xem video ngắn ở trên.\n\nNếu có bất kỳ câu hỏi nào về nền tảng hoặc token — **hãy nhắn ngay vào đây, trong chat này**. Tôi luôn online và sẽ trả lời bạn trong giây lát! 🚀`,
  hi: `Namaste, **{name}**! **RWA NFT FI** community mein aapka swagat hai 🌍\n\nMain Vera hun, project ki AI assistant. Main aapko platform par jaldi se set hote, growth ke liye team dhundhne aur mining income shuru karne mein madad karungi.\n\n**Abhi kahan se shuru karein?**\nHamara pinned message dekhein aur upar diya gaya short video dekhein.\n\nAgar platform ya tokens ko lekar koi bhi sawal ho — **toh seedhe yahan, chat mein likhein**. Main hamesha online hun aur ek second mein jawab dungi! 🚀`
};

function getRefLink(lang) { return REF_LINKS[lang] || REF_LINKS['en']; }

const REG_KEYWORDS = [
  "регистрация", "зарегистрироваться", "как начать", "ссылка", "инструкция", "вайтлист", "whitepaper", "регистрации",
  "register", "registration", "sign up", "signup", "join", "get started", "link", "whitepaper", "how to start"
];

function detectLang(text) {
  const t = text.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(t)) return "zh";
  if (/[\u0900-\u097f]/.test(t)) return "hi";
  if (/[\u0400-\u04ff]/.test(t)) return "ru";
  if (/\b(de|das|die|ich|und|ist)\b/.test(t)) return "de";
  if (/\b(le|la|les|je|vous|comment)\b/.test(t)) return "fr";
  if (/\b(el|la|los|yo|como|que)\b/.test(t)) return "es";
  if (/\b(il|la|i|come|ciao)\b/.test(t)) return "it";
  if (/\b(o|a|os|as|como|ola)\b/.test(t)) return "pt";
  if (/\b(ve|bir|bu|nasil|merhaba)\b/.test(t)) return "tr";
  if (/\b(dang|ky|khong|duoc)\b/.test(t)) return "vi";
  return "en";
}

function isRegQuestion(text) {
  const t = text.toLowerCase();
  return REG_KEYWORDS.some(kw => t.includes(kw));
}

const SYSTEM_PROMPT = `You are Vera — human-like support assistant of the RWA NFT FI ecosystem on Binance Smart Chain.

HUMAN-LIKE STYLE RULES WITH BOLD TEXT (CRITICAL):
- Write naturally, like a real person in a chat. 
- Use ONLY double asterisks (**word**) to make key points, main metrics, or crucial numbers bold.
- NEVER use hashtags (##, ###) for titles. Never write titles at all.
- NEVER use markdown separators like '---' or excessive robotic lists.
- Write in casual, neat paragraphs. Keep it clean, direct, and concise.
- Always reply in the EXACT same language the user used. Never switch languages.

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

async function processIncomingMessage(userId, chatId, userText, msgObjectForForwarding = null) {
  const cleanText = userText.replace(/@\w+/g, "").trim();
  const text = cleanText || userText;
  const lang = detectLang(text);
  const refLink = getRefLink(lang);

  // Если юзер просит регистрацию, вайтлист или ссылки — Claude генерирует сочный умный ответ
  if (isRegQuestion(text)) {
    const promptForLinks = `The user is asking about registration, links, or whitepaper: "${text}". 
    Give them a friendly, direct response with step-by-step guidance.
    You MUST naturally include these exact official links in your response:
    - Registration/Platform: ${refLink}
    - Official Whitepaper: https://whitepaper.rwanftfi.com
    - Pitch Deck: https://deck.rwanftfi.com
    Keep the response concise, helpful, and completely in the user's language.`;
    
    return await askClaude(userId, promptForLinks, refLink);
  }

  return await askClaude(userId, text, refLink);
}

bot.on("new_chat_members", async (msg) => {
  const chatId = msg.chat.id;
  const newMembers = msg.new_chat_members;

  for (const member of newMembers) {
    if (member.is_bot) continue;

    const langCode = member.language_code ? member.language_code.toLowerCase() : "en";
    const lang = WELCOME_TEXTS[langCode] ? langCode : "en";
    
    const name = member.first_name || "User";
    const rawText = WELCOME_TEXTS[lang].replace("{name}", name);

    if (welcomeVideos[lang]) {
      try {
        await bot.sendVideo(chatId, welcomeVideos[lang], { caption: rawText, parse_mode: "Markdown", message_thread_id: msg.message_thread_id });
      } catch (err) {
        console.error(`Error sending welcome video for ${lang}:`, err.message);
        await bot.sendMessage(chatId, rawText, { parse_mode: "Markdown", message_thread_id: msg.message_thread_id });
      }
    } else {
      await bot.sendMessage(chatId, rawText, { parse_mode: "Markdown", message_thread_id: msg.message_thread_id });
    }
  }
});

bot.on("message", async (msg) => {
  if (msg.new_chat_members) return;

  if (msg.chat.type === "private" && msg.video) {
    const fileName = msg.video.file_name ? msg.video.file_name.toLowerCase() : "";
    let detectedLang = null;

    if (/[\u4e00-\u9fff]/.test(fileName) || fileName.includes("chinese") || fileName.includes("zh")) detectedLang = "zh";
    else if (/[\u0900-\u097f]/.test(fileName) || fileName.includes("hindi") || fileName.includes("hi")) detectedLang = "hi";
    else if (/[а-яА-ЯёЁ]/.test(fileName) || fileName.includes("russian") || fileName.includes("ru")) detectedLang = "ru";
    else if (fileName.includes("về") || fileName.includes("nền") || fileName.includes("tảng") || fileName.includes("vi")) detectedLang = "vi";
    else if (fileName.includes("hakkında") || fileName.includes("nedir") || fileName.includes("nasıl") || fileName.includes("tr")) detectedLang = "tr";
    else if (fileName.includes("sobre_a") || fileName.includes("portuguese") || fileName.includes("pt")) detectedLang = "pt";
    else if (fileName.includes("sobre_la") || fileName.includes("spanish") || fileName.includes("es")) detectedLang = "es";
    else if (fileName.includes("sulla") || fileName.includes("piattaforma") || fileName.includes("funziona") || fileName.includes("it")) detectedLang = "it";
    else if (fileName.includes("german") || fileName.includes("de")) detectedLang = "de";
    else if (fileName.includes("french") || fileName.includes("fr")) detectedLang = "fr";
    else if (fileName.includes("filipino") || fileName.includes("fil")) detectedLang = "fil";
    else {
      const keys = ["en", "de", "fr", "es", "pt", "it", "fil", "tr", "vi", "hi", "zh", "ru"];
      detectedLang = keys.find(lang => fileName.includes(lang));
    }

    if (detectedLang) {
      welcomeVideos[detectedLang] = msg.video.file_id;
      fs.writeFileSync(VIDEO_DB_PATH, JSON.stringify(welcomeVideos, null, 2), "utf8");
      bot.sendMessage(msg.chat.id, `✅ Видео для языка **${detectedLang.toUpperCase()}** автоматически распознано и сохранено!`, { parse_mode: "Markdown" });
      return;
    } else {
      bot.sendMessage(msg.chat.id, `❌ Не смогла понять язык по названию файла: "${msg.video.file_name}".`);
      return;
    }
  }

  if (!msg.text || msg.text.startsWith("/")) return;
  bot.sendChatAction(msg.chat.id, "typing");
  
  const reply = await processIncomingMessage(msg.from.id, msg.chat.id, msg.text.trim(), msg);
  if (reply) {
    const sendOptions = { reply_to_message_id: msg.message_id, parse_mode: "Markdown" }; 
    if (msg.message_thread_id) sendOptions.message_thread_id = msg.message_thread_id;
    bot.sendMessage(msg.chat.id, reply, sendOptions);
  }
});

const PORT = process.env.PORT || 3000;
const RENDER_URL = "https://verkaassistantbot-b0uq.onrender.com";

http.createServer((req, res) => {
  if (req.url === "/" || req.url === "") {
    if (req.method === "GET" || req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "text/plain", "Connection": "close" });
      res.end("OK");
      return;
    }
  }

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
    const webhookUrl = `${RENDER_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
    await bot.setWebHook(webhookUrl, { drop_pending_updates: true });
    console.log(`Webhook successfully set to: ${webhookUrl}`);
  } catch (e) {
    console.error("Webhook activation error:", e.message);
  }
});
