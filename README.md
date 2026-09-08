# Agentlar — Dilmurodning Telegram agentlari

Bitta kod bazasi, uchta alohida bot, bitta gruppa. Har bir agent — alohida shaxs.

## Debra: Telegram shaxsiy xabarlari

- Telegram Business → Chatbots orqali Debraga kerakli suhbatlarni o‘qish va javob berish ruxsatini bering. `BUSINESS_OWNER_ID` ga o‘zingizning raqamli Telegram user ID’ingizni kiriting. Oldindan saqlangan Business egasi ham ishlaydi; ikkalasi ham yo‘q bo‘lsa Debra buyruq bajarmaydi.
- Kiruvchi matn, GIF, video, rasm, ovoz, audio, hujjat, stiker va video doira guruhga asl fayl ID’si bilan uzatiladi. Yuboruvchining ismi, username’i (mavjud bo‘lsa) va chat ID alohida ko‘rsatiladi. Albom elementlari alohida xabarlar sifatida uzatiladi. Kontakt va joylashuv ham uzatiladi; so‘rovnoma va zar natijasi matn bilan ko‘rsatiladi. Uzatish xatosi guruhda bildiriladi.
- «Debra, @username ga ertaga soat 10 da uchrashamiz deb yoz» deb topshiring. Ism bilan ham qidirish mumkin. Debra oluvchi va to‘liq matnni chiqaradi; faqat hisob egasi **Yuborish** tugmasini bosganda yuboradi. **Bekor qilish** ham bor. Tasdiqlash 10 daqiqa amal qiladi; qayta ishga tushganda kutilayotgan qoralamalar bekor bo‘ladi.
- Avtomatik shaxsiy javoblar o‘chirilgan (`BUSINESS_AUTOREPLY=1` ham xabar yubormaydi). Begona guruh a’zolari Debra buyruqlarini bajartira olmaydi.
- Bot faqat Business orqali o‘ziga ochilgan suhbatlarni ko‘radi; eski yozishmalarni Telegram’dan yuklab olmaydi. Avval saqlangan kontaktlar ism bilan topiladi, username yangi kiruvchi xabarda yangilanadi. Telegram javob yuborishni oxirgi 24 soatda kiruvchi xabari bo‘lgan suhbatlar bilan cheklaydi: [BusinessBotRights](https://core.telegram.org/bots/api#businessbotrights).
- Mahalliy tekshiruv: `node --test test/debra.test.js`. Testlar Telegramga haqiqiy xabar yubormaydi.

Kod o‘zgargach ishlayotgan servisni qayta ishga tushirish/deploy qilish kerak.

| Agent | Bot | Vazifa | Holat |
|-------|-----|--------|-------|
| **Radar** | alohida bot | Har kuni AI yangiliklari (o'zbekcha) + biznes g'oyasi | ✅ tayyor |
| **Lingo** | alohida bot | Har kuni ingliz tili (SRS, so'zlar, o'qish, yozish) | ⏳ keyingi |
| **Kotib** | Business bot | Shaxsiy xabarlar, o'chirilgan xabarlar, avto-javob | ⏳ keyingi |

Hozircha **Radar** ishlaydi. Umumiy yadro (`src/core/`) qolgan agentlarga ham xizmat qiladi.

---

## Radar nima qiladi

- **09:00** — 🤖 *AI Digest*: 7+ manbadan (TechCrunch, VentureBeat, The Verge, MIT, Ars Technica, Google, Simon Willison, Hacker News) eng muhim 5 ta yangilikni tanlab, o'zbekchaga tarjima qilib, "nega muhim" izohi bilan gruppaga tashlaydi.
- **20:00** — 💡 *Kunning g'oyasi*: Show HN / Ask HN'dan (va imkoni bo'lsa Reddit) ishlab ketgan mikro-biznesni topib, O'zbekiston bozoriga moslab tahlil qiladi: qayerda ishladi, daromad, qanday ishlaydi, O'zbekistonda qanday, birinchi qadam, xavf.

Takrorlanmaslik SQLite'da URL-hash orqali kuzatiladi. Xabar muvaffaqiyatli yuborilgandan **keyin** "ko'rilgan" deb belgilanadi — xatolik bo'lsa yangilik yo'qolmaydi.

---

## 1. Botlarni yaratish (@BotFather)

1. Telegram'da [@BotFather](https://t.me/BotFather) ga `/newbot` yozing.
2. Ism va username bering (masalan `Dilmurod Radar` / `dimonbek_radar_bot`).
3. Berilgan tokenni `.env` dagi `RADAR_BOT_TOKEN` ga qo'ying.

## 2. Gruppani sozlash (Topics / Forum rejimi tavsiya)

1. Yangi gruppa oching, uch botni ham **admin** qiling.
2. Gruppa sozlamalari → **Topics** (forum) rejimini yoqing.
3. Ikki mavzu oching: `🤖 AI Yangiliklar` va `💡 G'oyalar`.

**Gruppa va mavzu ID'larini olish:**

- Gruppa ID: botni gruppaga qo'shib, gruppaga biror xabar yozing, keyin
  `https://api.telegram.org/bot<TOKEN>/getUpdates` ni brauzerda oching. `chat.id` (manfiy son, `-100...`) — bu `GROUP_CHAT_ID`.
- Mavzu ID: har mavzuga xabar yozing, o'sha `getUpdates` javobida `message_thread_id` — bu `TOPIC_NEWS_ID` / `TOPIC_IDEAS_ID`.

> Topics ishlatmasangiz `TOPIC_*` ni bo'sh qoldiring — hammasi asosiy oqimga tushadi.

## 3. Sozlash

```bash
cp .env.example .env
# .env ni to'ldiring: ANTHROPIC_API_KEY, RADAR_BOT_TOKEN, GROUP_CHAT_ID, TOPIC_*
npm install
```

## 4. Sinash (darhol bitta post)

```bash
npm run radar:news
```

```bash
npm run radar:idea
```

Gruppaga post kelsa — ishladi. Doimiy jadval rejimi:

```bash
npm start
```

---

## Railway'ga deploy

1. Reponi GitHub'ga yuklang, Railway'da yangi proyekt → shu repo.
2. **Variables** bo'limiga `.env` dagi hamma o'zgaruvchini qo'shing
   (`ANTHROPIC_API_KEY`, `RADAR_BOT_TOKEN`, `GROUP_CHAT_ID`, `TOPIC_*`, `TZ=Asia/Tashkent`).
3. **Volume** qo'shing, mount yo'li `/app/data`, va `DB_PATH=/app/data/agentlar.db` o'zgaruvchisini bering — SQLite qayta ishga tushganda saqlanib qolsin.
4. Deploy. Servis `worker` sifatida doim ishlaydi, cron ichkarida jadval bo'yicha ishga tushadi.

---

## Sozlamalar (.env)

| O'zgaruvchi | Vazifa | Default |
|-------------|--------|---------|
| `LLM_MODEL` | Model: `claude-opus-4-8` \| `claude-sonnet-5` \| `claude-haiku-4-5` | `claude-opus-4-8` |
| `LLM_EFFORT` | Tafakkur chuqurligi: `low`..`max` (past = arzon) | `medium` |
| `CRON_NEWS` / `CRON_IDEA` | Jadval (cron formati, TZ bo'yicha) | `0 9 * * *` / `0 20 * * *` |
| `NEWS_COUNT` | Postdagi yangiliklar soni | `5` |
| `NEWS_WINDOW_HOURS` | Necha soatlik yangiliklar hisobga olinadi | `36` |

> **Model tanlash:** arzonroq/tezroq variant uchun `LLM_MODEL=claude-haiku-4-5` qo'ying — tarjima va tanlash uchun yetarli. Sifatliroq g'oya tahlili uchun `claude-opus-4-8` qoldiring.

---

## Tuzilma

```
src/
├─ core/            # umumiy yadro (uch agent uchun)
│  ├─ config.js     # .env o'qish
│  ├─ db.js         # SQLite: takrorlanish + jurnallar
│  ├─ llm.js        # Anthropic — sxemaga mos JSON
│  ├─ telegram.js   # yuborish, 4096-belgi bo'lish, HTML
│  └─ logger.js
├─ agents/
│  └─ radar/
│     ├─ sources.js   # RSS + Hacker News + Reddit(best-effort)
│     ├─ pipeline.js  # tanlash → tarjima → formatlash
│     └─ index.js     # cron jadval
└─ index.js         # kirish nuqtasi (--once=radar:news bilan bir martalik)
```

Lingo va Kotib qo'shilganda `src/agents/lingo/` va `src/agents/kotib/` sifatida shu yadroni ishlatadi.
