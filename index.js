require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Инициализация бота с поддержкой скрытых обновлений для супергрупп
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
  polling: false,
  allowed_updates: ["message", "chat_member", "callback_query"] 
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const histories = new Map();
const MAX_HISTORY = 10;

// Сет для защиты от повторных приветствий одного и того же человека за короткое время
const welcomedUsers = new Set();

// Файл для хранения ID приветственных видео по языкам
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

// Тексты приветствий на разных языках
const WELCOME_TEXTS = {
  ru: `Привет, **{name}**! Добро пожаловать в **RWA NFT FI** 🌍\n\nЯ Вера, ИИ-ассистент проекта. Помогу тебе быстро освоиться на платформе, найти команду для развития и запустить свой доход на майнинге.\n\n**С чего начать прямо сейчас?**\nИзучи наш закреп и посмотри короткое видео выше.\n\nЕсли появятся любые вопросы по платформе или токенам — **пиши их прямо сюда, в чат**. Я всегда в сети и отвечу тебе за секунду! 🚀`,
  en: `Hi, **{name}**! Welcome to **RWA NFT FI** 🌍\n\nI'm Vera, the AI assistant. I'll help you get started on the platform, find a team for growth, and launch your mining income.\n\n**Where to start right now?**\nCheck out our pinned message and watch the short video above.\n\nIf you have any questions about the platform or tokens, **drop them right here in the chat**. I'm always online and will reply in a second! 🚀`,
  de: `Hallo, **{name}**! Willkommen bei **RWA NFT FI** 🌍\n\nIch bin Vera, die KI-Assistentin des Projekts. Ich helfe dir, dich schnell auf der Plattform zurechtzufinden, ein Team für die Entwicklung aufzubauen und dein Mining-Einkommen zu starten.\n\n**Wo soll man jetzt anfangen?**\nLies unsere angepinnte Nachricht und schau dir das kurze Video oben an.\n\nWenn du Fragen zur Plattform oder zu den Token hast — **schreibe sie direkt hier in den Chat**. Ich bin immer online und antworte dir sofort! 🚀`,
  fr: `Bonjour, **{name}**! Bienvenue chez **RWA NFT FI** 🌍\n\nJe suis Vera, l'assistante IA du projet. Je t'aiderai à te familiariser rapidement avec la plateforme, à trouver une équipe para te développer et à lancer tes revenus de mining.\n\n**Par quoi commencer dès maintenant ?**\nConsulte notre message épinglé et regarde la courte vidéo ci-dessus.\n\nSi tu as des questions sur la plateforme ou les tokens — **écris-les directement ici dans le chat**. Je suis toujours en ligne et je te répondrai en une seconde ! 🚀`,
  es: `¡Hola, **{name}**! Bienvenido a **RWA NFT FI** 🌍\n\nSoy Vera, la asistente de IA del proyecto. Te ajudaré a familiarizarte rápidamente con la plataforma, encontrar un equipo para desarrollarte y lanzar tus ingresos de minería.\n\n**¿Por dónde empezar ahora mismo?**\nRevisa nuestro mensaje fijado y mira el breve video de arriba.\n\nSi tienes alguna pregunta sobre la plataforma o los tokens, **escríbela directamente aquí en el chat**. ¡Siempre estoy en línea y te responderé en un segundo! 🚀`,
  pt: `Olá, **{name}**! Bem-vindo ao **RWA NFT FI** 🌍\n\nSou Vera, a assistente de IA do projeto. Vou te ajudar a se ambientar rapidamente na plataforma, encontrar uma equipe para evoluir e lançar sua renda com mineração.\n\n**Por onde começar agora mesmo?**\nConfira nossa mensagem fixada e assista ao breve vídeo acima.\n\nSe tiver qualquer dúvida sobre a pf ou tokens — **escreva direto aqui no chat**. Estou sempre online и те respondo em um segundo! 🚀`,
  it: `Ciao, **{name}**! Benvenuto in **RWA NFT FI** 🌍\n\nSono Vera, l'assistente IA del progetto. Ti aiuterò a orientarti rapidamente sulla piattaforma, trovare un team per crescere e avviare la tua rendita dal mining.\n\n**Da onde iniziare adesso?**\nDai un'occhiata al nostro messaggio in evidenza e guarda il breve video sopra.\n\nSe hai domande sulla piattaforma o sui token — **scrivile direttamente qui in chat**. Sono sempre online e ti risponderò in un secondo! 🚀`,
  zh: `你好，**{name}**！欢迎来到 **RWA NFT FI** 🌍\n\n我是维拉（Vera），项目的 AI 助手。我将帮助您快速熟悉平台、找到共同发展的团队并开启您的挖矿收益。\n\n**现在该如何开始？**\n请查看我们的置顶消息并观看上方的短视频。\n\n如果您对平台或代币有任何疑问 — **请直接在聊天中发送**。我一直在线，会在一秒钟内回复您！🚀`,
  fil: `Hi, **{name}**! Maligayang pagdating sa **RWA NFT FI** 🌍\n\nAko si Vera, ang AI assistant ng projektu. Tutulungan kitang mabilis na masanay sa platform, makahanap ng koponan para sa paglago, at simulan ang iyong kita sa mining.\n\n**Saan magsisimula ngayon?**\nTingnan ang aming pinned message at panoorin ang maikling video sa itaas.\n\nKung mayroon kang anumang mga katanungan tungkol sa platform o tokens — **i-drop ang mga ito dito mismo sa chat**. Laging akong online at sasagutin kita sa loob ng isang segundo! 🚀`,
  tr: `Merhaba...`,
  vi: `Chào...`,
  hi: `Namaste...`
};

function getRefLink(lang) { return REF_LINKS[lang] || REF_LINKS['en']; }

const REG_KEYWORDS = [
  "регистрация", "зарегистрироваться", "как начать", "ссылка", "инструкция", "вайтлист", "whitepaper",
  "register", "registration", "sign up", "signup", "join", "get started", "link", "whitepaper"
];

function detectLang(text) {
  const t = text.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(t)) return "zh";
  if (/[\u0900-\u097f]/.test(t)) return "hi";
  if (/[\u0400-\u04ff]/.test(t)) return "ru";
  if (/\b(de|das|die)\b/.test(t)) return "de";
  if (/\b(le|la|les)\b/.test(t)) return "fr";
  if (/\b(el|la|los)\b/.test(t)) return "es";
  if (/\b(il|la|i)\b/.test(t)) return "it";
  if (/\b(o|a|os)\b/.test(t)) return "pt";
  if (/\b(ve|bir|bu)\b/.test(t)) return "tr";
  if (/\b(dang|ky)\b/.test(t)) return "vi";
  return "en";
}

function isRegQuestion(text) {
  const t = text.toLowerCase();
  return REG_KEYWORDS.some(kw => t.includes(kw));
}

const SYSTEM_PROMPT = `You are Vera — human-like support assistant of the RWA NFT FI ecosystem on Binance Smart Chain.`;

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
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT + `\n\nREF LINK FOR THIS USER: ${refLink}`,
    messages: getHistory(userId),
  });
  const reply = response.content[0].text;
  addToHistory(userId, "assistant", reply);
  return reply;
}

async function processIncomingMessage(userId, chatId, userText) {
  const text = userText.replace(/@\w+/g, "").trim();
  const lang = detectLang(text);
  const refLink = getRefLink(lang);

  if (isRegQuestion(text)) {
    return await askClaude(userId, `The user asks about registration. Guide them nicely with links:\n- Platform: ${refLink}\n- Whitepaper: https://whitepaper.rwanftfi.com`, refLink);
  }
  return await askClaude(userId, text, refLink);
}

// ПЕРЕХВАТ МОМЕНТА ВХОДА
bot.on("chat_member", async (update) => {
  const chatId = update.chat.id;
  const member = update.new_chat_member;
  if (!member || !member.user) return;

  const userId = member.user.id;
  if (member.user.is_bot) return;

  const wasOutside = !update.old_chat_member || 
                     update.old_chat_member.status === "left" || 
                     update.old_chat_member.status === "kicked" || 
                     !update.old_chat_member.status;

  const isInsideNow = member.status === "member" || member.status === "restricted";

  if (wasOutside && isInsideNow) {
    if (welcomedUsers.has(userId)) return;
    welcomedUsers.add(userId);

    const langCode = member.user.language_code ? member.user.language_code.toLowerCase() : "en";
    const lang = WELCOME_TEXTS[langCode] ? langCode : "en";
    
    const name = member.user.first_name || "User";
    const rawText = WELCOME_TEXTS[lang].replace("{name}", name);

    // УСТАНОВЛЕНО 5 СЕКУНД (5000 мс) — идеальная пауза после появления капчи
    setTimeout(async () => {
      if (welcomeVideos[lang]) {
        try {
          await bot.sendVideo(chatId, welcomeVideos[lang], { caption: rawText, parse_mode: "Markdown" });
        } catch (err) {
          console.error(`Error sending video:`, err.message);
          await bot.sendMessage(chatId, rawText, { parse_mode: "Markdown" });
        }
      } else {
        await bot.sendMessage(chatId, rawText, { parse_mode: "Markdown" });
      }
    }, 5000);
  }
});

// Обработчик текста и админки
bot.on("message", async (msg) => {
  if (msg.new_chat_members) return;

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
      bot.sendMessage(msg.chat.id, `✅ Видео для языка **${detectedLang.toUpperCase()}** сохранено!`, { parse_mode: "Markdown" });
      return;
    }
    return;
  }

  if (!msg.text || msg.text.startsWith("/")) return;
  bot.sendChatAction(msg.chat.id, "typing");
  
  const reply = await processIncomingMessage(msg.from.id, msg.chat.id, msg.text.trim());
  if (reply) {
    const sendOptions = { reply_to_message_id: msg.message_id, parse_mode: "Markdown" };
    if (msg.message_thread_id) sendOptions.message_thread_id = msg.message_thread_id;
    bot.sendMessage(msg.chat.id, reply, sendOptions);
  }
});

const PORT = process.env.PORT || 3000;
const RENDER_URL = "https://verkaassistantbot-b0uq.onrender.com";

http.createServer((req, res) => {
  if (req.url === `/bot${process.env.TELEGRAM_BOT_TOKEN}` && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try { bot.processUpdate(JSON.parse(body)); } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(200); res.end("OK");
}).listen(PORT, async () => {
  try {
    await bot.setWebHook(`${RENDER_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`, { drop_pending_updates: true });
  } catch (e) {}
});
