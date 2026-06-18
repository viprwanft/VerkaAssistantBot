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
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const histories = new Map();
const MAX_HISTORY = 10;
const welcomedUsers = new Set();
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
  ru: `Привет, **{name}**! Добро пожаловать в **RWA NFT FI** 🌍\n\nЯ Вера, ИИ-ассистент проекта. Помогу тебе быстро освоиться на платформе, найти команду для развития и запустить свой доход на майнинге.\n\n**С чего начать прямо сейчас?**\nИзучи наш закреп и посмотри короткое видео выше.\n\nЕсли появятся любые вопросы по платформе или токенам — **пиши их прямо сюда, в чат**. Я всегда в сети и отвечу тебе за секунду! 🚀`,
  en: `Hi, **{name}**! Welcome to **RWA NFT FI** 🌍\n\nI'm Vera, the AI assistant. I'll help you get started on the platform, find a team for growth, and launch your mining income.\n\n**Where to start right now?**\nCheck out our pinned message and watch the short video above.\n\nIf you have any questions about the platform or tokens, **drop them right here in the chat**. I'm always online and will reply in a second! 🚀`,
  de: `Hallo, **{name}**! Willkommen bei **RWA NFT FI** 🌍\n\nIch bin Vera, die KI-Assistentin des Projekts. Ich helfe dir, dich schnell auf der Plattform zurechtzufinden, ein Team für die Entwicklung aufzubauen und dein Mining-Einkommen zu starten.\n\n**Wo soll man jetzt anfangen?**\nLies unsere angepinnte Nachricht und schau dir das kurze Video oben an.\n\nWenn du Fragen zur Plattform oder zu den Token hast — **schreibe sie direkt hier in den Chat**. Ich bin immer online und antworte dir sofort! 🚀`,
  fr: `Bonjour, **{name}**! Bienvenue chez **RWA NFT FI** 🌍\n\nJe suis Vera, l'assistante IA du projet. Je t'aiderai à te familiariser rapidement avec la plateforme, à trouver une équipe pour te développer et à lancer tes revenus de mining.\n\n**Par quoi commencer dès maintenant ?**\nConsulte notre message épinglé et regarde la courte vidéo ci-dessus.\n\nSi tu as des questions sur la plateforme ou les tokens — **écris-les directement ici dans le chat**. Je suis toujours en ligne et je te répondrai en une seconde ! 🚀`,
  es: `¡Hola, **{name}**! Bienvenido a **RWA NFT FI** 🌍\n\nSoy Vera, la asistente de IA del proyecto. Te ayudaré a familiarizarte rápidamente con la plataforma, encontrar un equipo para desarrollarte y lanzar tus ingresos de minería.\n\n**¿Por dónde empezar ahora mismo?**\nRevisa nuestro mensaje fijado y mira el breve video de arriba.\n\nSi tienes alguna pregunta sobre la plataforma o los tokens, **escríbela directamente aquí en el chat**. ¡Siempre estoy en línea y te responderé en un segundo! 🚀`,
  pt: `Olá, **{name}**! Bem-vindo ao **RWA NFT FI** 🌍\n\nSou Vera, a assistente de IA do projeto. Vou te ajudar a se ambientar rapidamente na plataforma, encontrar uma equipe para evoluir e lançar sua renda com mineração.\n\n**Por onde começar agora mesmo?**\nConfira nossa mensagem fixada e assista ao breve vídeo acima.\n\nSe tiver qualquer dúvida sobre a plataforma ou tokens — **escreva direto aqui no chat**. Estou sempre online e te respondo em um segundo! 🚀`,
  it: `Ciao, **{name}**! Benvenuto in **RWA NFT FI** 🌍\n\nSono Vera, l'assistente IA del progetto. Ti aiuterò a orientarti rapidamente sulla piattaforma, trovare un team per crescere e avviare la tua rendita dal mining.\n\n**Da dove iniziare adesso?**\nDai un'occhiata al nostro messaggio in evidenza e guarda il breve video sopra.\n\nSe hai domande sulla piattaforma o sui token — **scrivile direttamente qui in chat**. Sono sempre online e ti risponderò in un secondo! 🚀`,
  zh: `你好，**{name}**！欢迎来到 **RWA NFT FI** 🌍\n\n我是维拉（Vera），项目的 AI 助手。我将帮助您快速熟悉平台、找到共同发展的团队并开启您的挖矿收益。\n\n**现在该如何开始？**\n请查看我们的置顶消息并观看上方的短视频。\n\n如果您对平台或代币有任何疑问 — **请直接在聊天中发送**。我一直在线，会在一秒钟内回复您！🚀`,
  fil: `Hi, **{name}**! Maligayang pagdating sa **RWA NFT FI** 🌍\n\nAko si Vera, ang AI assistant ng proyekto. Tutulungan kitang mabilis na masanay sa platform, makahanap ng koponan para sa paglago, at simulan ang iyong kita sa mining.\n\n**Saan magsisimula ngayon?**\nTingnan ang aming pinned message at panoorin ang maikling video sa itaas.\n\nKung mayroon kang anumang mga katanungan tungkol sa platform o tokens — **i-drop ang mga ito dito mismo sa chat**. Laging akong online at sasagutin kita sa loob ng isang segundo! 🚀`,
  tr: `Merhaba, **{name}**! **RWA NFT FI**'ya hoş geldin 🌍\n\nBen Vera, projenin yapay zeka asistanıyım. Platformda hızlıca yön bulmana, gelişim için bir ekip bulmana ve madencilik gelirini başlatmana yardımcı olacağım.\n\n**Şimdi nereden başlamalı?**\nSabitlenmiş mesajımıza göz at ve yukarıdaki kısa videoyu izle.\n\nPlatform veya tokenler hakkında soruların varsa — **doğrudan buraya, sohbete yaz**. Her zaman çevrimiçiyim ve bir saniye içinde cevap vereceğim! 🚀`,
  vi: `Xin chào, **{name}**! Chào mừng đến với **RWA NFT FI** 🌍\n\nTôi là Vera, trợ lý AI của dự án. Tôi sẽ giúp bạn nhanh chóng làm quen với nền tảng, tìm một nhóm để phát triển và bắt đầu thu nhập từ khai thác.\n\n**Bắt đầu từ đâu ngay bây giờ?**\nHãy xem tin nhắn được ghim của chúng tôi và xem video ngắn ở trên.\n\nNếu bạn có bất kỳ câu hỏi nào về nền tảng hoặc token — **hãy viết trực tiếp vào đây, trong chat**. Tôi luôn trực tuyến và sẽ trả lời bạn trong vòng một giây! 🚀`,
  hi: `नमस्ते, **{name}**! **RWA NFT FI** में आपका स्वागत है 🌍\n\nमैं वेरा हूं, प्रोजेक्ट की AI सहायक। मैं आपको प्लेटफ़ॉर्म पर जल्दी से शुरुआत करने, विकास के लिए एक टीम खोजने और अपनी माइनिंग आय शुरू करने में मदद करूंगी।\n\n**अभी कहां से शुरू करें?**\nहमारा पिन किया गया संदेश देखें और ऊपर दिया गया छोटा वीडियो देखें।\n\nयदि आपके पास प्लेटफ़ॉर्म या टोकन के बारे में कोई प्रश्न हैं — **उन्हें सीधे यहीं चैट में लिखें**। मैं हमेशा ऑनलाइन हूं और एक सेकंड में जवाब दूंगी! 🚀`
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

// userObj = the Telegram user who joined. threadId = forum branch they joined in (if any).
async function triggerDirectWelcome(chatId, userObj, threadId) {
  if (!userObj || userObj.is_bot) return;
  const userId = userObj.id;
  if (!welcomedUsers.has(userId)) {
    welcomedUsers.add(userId);

    // Priority: 1) language of the branch/thread they joined, 2) their Telegram app language, 3) English
    const threadLang = getLangByThread(threadId);
    const lang = threadLang || normalizeLangCode(userObj.language_code);

    const name = userObj.first_name || "User";
    const rawText = WELCOME_TEXTS[lang].replace("{name}", name);

    const sendOptions = { parse_mode: "Markdown" };
    if (threadId) sendOptions.message_thread_id = threadId;

    // Пауза 5 секунд, чтобы капча отработала первой
    setTimeout(async () => {
      if (welcomeVideos[lang]) {
        try {
          await bot.sendVideo(chatId, welcomeVideos[lang], { ...sendOptions, caption: rawText });
        } catch (err) {
          await bot.sendMessage(chatId, rawText, sendOptions);
        }
      } else {
        await bot.sendMessage(chatId, rawText, sendOptions);
      }
    }, 5000);
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
  // Use this to fill in the correct THREAD_LANG map below, then this log line can be removed.
  if (msg.chat.type !== "private") {
    console.log(`[THREAD DEBUG] chat=${msg.chat.id} thread_id=${msg.message_thread_id} text="${msg.text.slice(0, 30)}"`);
  }

  bot.sendChatAction(msg.chat.id, "typing");

  let reply = null;
  try {
    reply = await processIncomingMessage(msg.from.id, msg.chat.id, msg.text.trim());
  } catch (err) {
    console.error("processIncomingMessage error:", err.message);
    // One retry — most failures here are transient network blips (Premature close, ECONNRESET)
    try {
      reply = await processIncomingMessage(msg.from.id, msg.chat.id, msg.text.trim());
    } catch (err2) {
      console.error("processIncomingMessage retry failed:", err2.message);
      const lang = detectLang(msg.text);
      const fallbackTexts = {
        ru: "Извините, временный сбой связи. Повторите вопрос, пожалуйста 🙏",
        en: "Sorry, a temporary connection issue occurred. Please ask again 🙏",
      };
      reply = fallbackTexts[lang] || fallbackTexts.en;
    }
  }

  if (reply) {
    const sendOptions = { reply_to_message_id: msg.message_id, parse_mode: "Markdown" };
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

          // The real "joined and passed captcha" moment: transitioning INTO "member"
          // FROM something that wasn't already "member" (covers restricted -> member,
          // left -> member, or no prior record -> member).
          const justBecameMember = newStatus === "member" && oldStatus !== "member";
          if (justBecameMember && memberUser && !memberUser.is_bot) {
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
