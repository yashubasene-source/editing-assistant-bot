const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const sessions = {};

function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { mode: null, data: {} };
  return sessions[chatId];
}

async function askAI(prompt) {
  const result = await model.generateContent(prompt);
  return result.response.text();
}

bot.onText(/\/start|\/menu/, (msg) => {
  const name = msg.from.first_name || "bhai";
  bot.sendMessage(msg.chat.id,
    `🎬 *Namaste ${name}! Main tera Editing Assistant hun!*\n\nKya help chahiye aaj?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🖼️ Thumbnail Ideas", callback_data: "thumb" }],
          [{ text: "🎥 B-Roll Suggestions", callback_data: "broll" }],
          [{ text: "🧾 Client Invoice/Quote", callback_data: "invoice" }],
          [{ text: "❓ Commands", callback_data: "help" }],
        ],
      },
    }
  );
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = getSession(chatId);
  bot.answerCallbackQuery(query.id);

  if (data === "thumb") {
    session.mode = "thumb";
    session.data = {};
    bot.sendMessage(chatId,
      `🖼️ *Thumbnail Ideas Generator*\n\nVideo ka topic kya hai?\n\n_Example: "Ghar pe gym kaise banaye"_`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "broll") {
    session.mode = "broll";
    session.data = {};
    bot.sendMessage(chatId,
      `🎥 *B-Roll Suggestion*\n\nApna script ya video description bhejo!\n\n_Example: "Yeh video ek bakery ke baare mein hai..."_`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "invoice") {
    session.mode = "invoice_1";
    session.data = {};
    bot.sendMessage(chatId, `🧾 *Invoice Generator*\n\n*Step 1/4:* Client ka naam kya hai?`, { parse_mode: "Markdown" });
  } else if (data === "help") {
    bot.sendMessage(chatId,
      `❓ *Commands:*\n\n/start — Main menu\n/thumb — Thumbnail ideas\n/broll — B-roll suggestions\n/invoice — Client invoice`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "thumb_youtube") {
    session.data.platform = "YouTube";
    await generateThumbnail(chatId, session);
  } else if (data === "thumb_insta") {
    session.data.platform = "Instagram Reel";
    await generateThumbnail(chatId, session);
  } else if (data === "thumb_facebook") {
    session.data.platform = "Facebook";
    await generateThumbnail(chatId, session);
  } else if (data === "invoice_confirm") {
    await generateInvoice(chatId, session);
  } else if (data === "invoice_edit") {
    session.mode = "invoice_1";
    session.data = {};
    bot.sendMessage(chatId, `Theek hai! Dobara shuru karte hain.\n\n*Client ka naam kya hai?*`, { parse_mode: "Markdown" });
  } else if (data === "menu") {
    bot.sendMessage(chatId, `Main menu ke liye /start type karo!`);
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith("/")) return;

  const session = getSession(chatId);

  if (session.mode === "thumb") {
    session.data.topic = text;
    session.mode = "thumb_platform";
    bot.sendMessage(chatId, `🖼️ Kis platform ke liye hai?`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "▶️ YouTube", callback_data: "thumb_youtube" },
          { text: "📱 Instagram", callback_data: "thumb_insta" },
          { text: "📘 Facebook", callback_data: "thumb_facebook" },
        ]],
      },
    });
    return;
  }

  if (session.mode === "broll") {
    session.mode = null;
    bot.sendMessage(chatId, `⏳ _Script analyze kar raha hun..._ 🎬`, { parse_mode: "Markdown" });
    const prompt = `You are a professional video editor helping an Indian freelance editor.

Script/Description: "${text}"

Generate specific B-roll shot suggestions. For each main point suggest 2-3 shots.

Format:
📍 [Scene/Point]
• Shot 1: [description]
• Shot 2: [description]
• Shot 3: [description]

End with:
🎯 HERO SHOT: One cinematic establishing shot
⏱️ TIMING TIP: When to cut to B-roll

Be practical for a freelance editor in India.`;
    try {
      const result = await askAI(prompt);
      bot.sendMessage(chatId, `🎥 *B-Roll Suggestions:*\n\n${result}`, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [{ text: "🔄 Naya Script", callback_data: "broll" }],
          [{ text: "🏠 Main Menu", callback_data: "menu" }],
        ]},
      });
    } catch (e) {
      bot.sendMessage(chatId, `❌ Error aa gaya. /broll dobara try karo.`);
    }
    return;
  }

  if (session.mode === "invoice_1") {
    session.data.clientName = text;
    session.mode = "invoice_2";
    bot.sendMessage(chatId, `✅ Client: *${text}*\n\n*Step 2/4:* Kya kaam kiya?\n\n_Example: 2 min wedding video, 10 photos edit, 3 reels_`, { parse_mode: "Markdown" });
    return;
  }
  if (session.mode === "invoice_2") {
    session.data.services = text;
    session.mode = "invoice_3";
    bot.sendMessage(chatId, `✅ Services noted!\n\n*Step 3/4:* Tera naam ya business naam?`, { parse_mode: "Markdown" });
    return;
  }
  if (session.mode === "invoice_3") {
    session.data.editorName = text;
    session.mode = "invoice_4";
    bot.sendMessage(chatId, `✅ Got it!\n\n*Step 4/4:* Total amount? (₹ mein)\n\n_Example: 5000_`, { parse_mode: "Markdown" });
    return;
  }
  if (session.mode === "invoice_4") {
    session.data.amount = text;
    session.mode = "invoice_confirm_state";
    const d = session.data;
    bot.sendMessage(chatId,
      `📋 *Invoice Preview:*\n\n👤 Client: ${d.clientName}\n🎬 Services: ${d.services}\n💰 Amount: ₹${d.amount}\n🧑‍💼 Editor: ${d.editorName}\n\nSahi hai?`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[
          { text: "✅ Generate Karo!", callback_data: "invoice_confirm" },
          { text: "✏️ Edit Karo", callback_data: "invoice_edit" },
        ]]},
      }
    );
    return;
  }

  bot.sendMessage(chatId, `Menu ke liye /menu type karo! 😊`);
});

async function generateThumbnail(chatId, session) {
  const { topic, platform } = session.data;
  session.mode = null;
  bot.sendMessage(chatId, `⏳ _Thumbnail ideas soch raha hun..._ 🎨`, { parse_mode: "Markdown" });

  const prompt = `You are a thumbnail expert for Indian content creators.

Video: "${topic}" | Platform: ${platform}

Give 4 thumbnail concepts with HIGH CTR potential.

For each:
🖼️ CONCEPT [n]: [Name]
📐 LAYOUT: [What's in frame]
✏️ TEXT: [Exact overlay text]
🎨 COLORS: [Color scheme]
🧠 WHY IT WORKS: [One line]

End with:
💡 PRO TIP: Quick tip for this topic.`;

  try {
    const result = await askAI(prompt);
    session.data = {};
    bot.sendMessage(chatId, `🖼️ *Thumbnail Ideas:*\n\n${result}`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [{ text: "🔄 Naya Topic", callback_data: "thumb" }],
        [{ text: "🏠 Main Menu", callback_data: "menu" }],
      ]},
    });
  } catch (e) {
    bot.sendMessage(chatId, `❌ Error. /thumb dobara try karo.`);
  }
}

async function generateInvoice(chatId, session) {
  const d = session.data;
  session.mode = null;
  bot.sendMessage(chatId, `⏳ _Invoice ready kar raha hun..._ 🧾`, { parse_mode: "Markdown" });

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const prompt = `Create a professional freelance invoice for WhatsApp/Telegram sharing.

From: ${d.editorName}
To: ${d.clientName}
Services: ${d.services}
Total: ₹${d.amount}
Date: ${today}

Include:
- Invoice header with number (random 4 digit)
- From/To section
- Services breakdown (estimate individual prices adding to total)
- Subtotal, GST note, Total
- Payment terms: 50% advance, 50% on delivery
- UPI payment placeholder
- Short thank you note

Format for text/Telegram. Professional but friendly tone.`;

  try {
    const result = await askAI(prompt);
    session.data = {};
    bot.sendMessage(chatId, result, {
      reply_markup: { inline_keyboard: [
        [{ text: "🔄 Naya Invoice", callback_data: "invoice" }],
        [{ text: "🏠 Main Menu", callback_data: "menu" }],
      ]},
    });
  } catch (e) {
    bot.sendMessage(chatId, `❌ Error. /invoice dobara try karo.`);
  }
}

bot.onText(/\/thumb/, (msg) => {
  const s = getSession(msg.chat.id);
  s.mode = "thumb"; s.data = {};
  bot.sendMessage(msg.chat.id, `🖼️ Video ka topic kya hai?`);
});

bot.onText(/\/broll/, (msg) => {
  const s = getSession(msg.chat.id);
  s.mode = "broll"; s.data = {};
  bot.sendMessage(msg.chat.id, `🎥 Apna script bhejo — B-roll shots suggest karunga!`);
});

bot.onText(/\/invoice/, (msg) => {
  const s = getSession(msg.chat.id);
  s.mode = "invoice_1"; s.data = {};
  bot.sendMessage(msg.chat.id, `🧾 *Step 1/4:* Client ka naam?`, { parse_mode: "Markdown" });
});

console.log("🎬 Editing Assistant Bot chal raha hai!");
