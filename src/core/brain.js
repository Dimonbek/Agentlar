import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { log } from './logger.js';

const client = new Anthropic({ apiKey: config.llm.apiKey });

/** Modelga mos web-qidiruv tool versiyasi. */
function webTool() {
  const m = config.llm.model;
  if (/^claude-(fable-5|opus-4-(6|7|8)|sonnet-(5|4-6))/.test(m)) {
    return { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };
  }
  return { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };
}

function systemFor(persona) {
  const base = `Sen — ${persona.name}, Dexterning shaxsiy AI jamoasidan bir a'zosan. Roling: ${persona.role}.
Dexter — O'zbekistonlik dasturchi va tadbirkor (asl ismi Dilmurod, lekin jamoada uni "Dexter" deb ataymiz). Telegram guruhida u seni isming bilan chaqirib topshiriq beradi.
Unga har doim "Dexter" deb murojaat qil.

Qoidalar:
- Sof, jonli o'zbek tilida javob ber. Agar u rus yoki ingliz tilida yozsa, o'sha tilda javob ber.
- Aniq, foydali va lo'nda bo'l — ortiqcha gap va suv quyma. Kerak bo'lsa ro'yxat qil.
- Zarur bo'lsa web_search bilan internetdan qidir. "Narx", "eng arzon", "eng yangi", "topib kel", "qara" kabi so'rovlarda albatta qidir va aniq ma'lumot bilan havola keltir.
- Sen AI yordamchisan; buni yashirmaysan, lekin har safar takrorlamaysan.
- Telegram uchun oddiy matn yoz — murakkab formatlash, jadval yoki markdown ishlatma.`;

  const extra = {
    rita: '\nSen yangiliklar va sun\'iy intellekt bo\'yicha mutaxassissan. Texnologiya, startaplar, AI vositalari va g\'oyalar sening sohang.',
    layla: '\nSen ingliz tili ustozisan. So\'z, grammatika, talaffuzni misollar bilan tushuntir, tarjima qil. Kurs yoki resurs so\'ralsa, aniqlarini qidirib top.',
    debra: '\nSen tashkiliy yordamchisan: vazifalar, rejalar, eslatmalar, umumiy qidiruv va kundalik topshiriqlarda yordam berasan.',
  };
  return base + (extra[persona.agent] ?? '');
}

// Joriy/dolzarb ma'lumot talab qiladigan so'rovlar — bularda qidiruvni majburlaymiz,
// chunki kichik model (Haiku) o'zi qidirishni tanlamaydi va eskirgan bilimdan javob beradi.
const SEARCH_HINTS =
  /(oxirgi|so['’]?nggi|eng yangi|yangi versiya|versiya|narx|qancha|necha pul|eng arzon|arzon|kurs|202[4-9]|hozir|bugun|kecha|ertaga|qidir|topib|top\b|qara|havola|link|yangilik|kim g[’']?olib|natija|ob-havo|valyuta|kurs[i]?)/i;

/** Persona nomidan foydalanuvchi topshirig'iga javob qaytaradi (kerak bo'lsa web qidiruv bilan). */
export async function respond({ persona, userText, maxTokens = 2000 }) {
  const system = systemFor(persona);
  const forceSearch = SEARCH_HINTS.test(userText);

  async function run(tools, force = false) {
    const messages = [{ role: 'user', content: userText }];
    const req = { model: config.llm.model, max_tokens: maxTokens, system, messages };
    if (tools) req.tools = tools;
    // Birinchi navbatda qidirishga majburlaymiz; keyingi turlarда model o'zi javob yozadi
    if (tools && force) req.tool_choice = { type: 'tool', name: 'web_search' };

    let res = await client.messages.create(req);
    let guard = 0;
    // Server-side tool (web_search) iteratsiya chegarasiga yetsa — davom ettiramiz
    while (res.stop_reason === 'pause_turn' && guard++ < 5) {
      messages.push({ role: 'assistant', content: res.content });
      res = await client.messages.create({
        model: config.llm.model, max_tokens: maxTokens, system, messages, tools,
      });
    }
    return res;
  }

  let res;
  try {
    res = await run([webTool()], forceSearch);
  } catch (err) {
    log.warn(`${persona.name}: web_search ishlamadi (${err.message}), web'siz javob beraman`);
    res = await run(null);
  }

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return text || 'Hozircha aniq javob topolmadim — biroz aniqroq yozib ko\'rasizmi?';
}
