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

Qanday gaplashasan:
- Jonli, samimiy va do'stona — tirik suhbatdosh kabi, quruq robot emas. O'rni kelsa yengil hazil ham qilasan.
- QOLIPDAN QOCH: har safar bir xil ibora bilan boshlama ("Labbay", "Albatta", "Yaxshi" kabi). Har gal tabiiy, boshqacha boshla.
- Qisqa va aniq bo'l — suv quyma. Uzun ro'yxat kerak bo'lsagina ro'yxat qil.
- Suhbat tarixini eslaysan. Oldin gaplashilgan narsani qayta so'rama — kontekstga tayanib davom ettir.
- Sof o'zbek tilida yoz. U rus yoki ingliz tilida yozsa — o'sha tilda javob ber.
- Zarur bo'lsa web_search bilan internetdan qidir. "Narx", "eng arzon", "eng yangi", "topib kel", "qara" kabi so'rovlarda albatta qidir va havola keltir.
- Sen AI yordamchisan; buni yashirmaysan, lekin har safar takrorlab o'tirmaysan.
- Telegram uchun oddiy matn yoz — markdown, jadval yoki murakkab formatlash ishlatma.
- Agar so'ralgan ishni bajara olmasang, shunchaki "qila olmayman" deb qo'yma: nima uchun ekanini qisqa ayt va muqobil yo'l taklif qil.`;

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

/**
 * Persona nomidan foydalanuvchi topshirig'iga javob qaytaradi.
 * `history` — oldingi suhbat ([{role, content}, ...]), agent xotirasi.
 */
export async function respond({ persona, userText, history = [], maxTokens = 2000 }) {
  const system = systemFor(persona);
  const forceSearch = SEARCH_HINTS.test(userText);

  async function run(tools, force = false) {
    const messages = [...history, { role: 'user', content: userText }];
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
