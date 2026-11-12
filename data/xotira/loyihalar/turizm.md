# Turizm Operatorlari Guruhi Pasporti

* **Mas'ul Agent:** Rita 🛰 (Turizm operatorlari va Sayohat botlari nazorati)
* **Status:** Faol ishlab turibdi

---

## 1. Loyihalar Tarkibi

### 1.1. Riva Tour Boti
* **Kalit:** `c-rivatour`
* **Telegram:** `@RivaTour_bot`
* **Xizmat:** `riva-tour-bot.service` (systemd, port 3002)
* **Vazifasi:** Riva Tour sayyohlik agentligining mijozlari uchun yo'nalishlar, narxlar va lidlar qabuli.

### 1.2. Zuhro Travel Boti
* **Kalit:** `c-zuhro`
* **Telegram:** `@zukhro_travelbot`
* **Xizmat:** Docker / Polling
* **Vazifasi:** Umra va xalqaro sayohatlar bo'yicha mijozlarga xizmat ko'rsatish va telefon raqamlarni qabul qilish.

### 1.3. Dilrabo Boti (Diloboda Star Tour)
* **Kalit:** `c-dilrabo`
* **Telegram:** `@DilobodaStarTour_bot`
* **Xizmat:** `dilrabo-bot.service` (systemd, port 3000)
* **Vazifasi:** Sayohat yo'nalishlari va mijozlar bronini qabul qilish.

### 1.4. Exotic Tour Boti
* **Kalit:** `exotic-bot`
* **Telegram:** `@exotictour_bot`
* **Integratsiya:** Yangi lidlarni Debra nazoratidagi Exotic CRM tizimiga uzatadi.

---

## 2. Mas'ul Rita'ning Vazifalari
1. To'rttala turizm botining Telegram API bilan doimiy bog'lanishda turishini (polling/webhook) kuzatish.
2. Botlarning javob berish tezligi (ping) va nosozliklarni darhol aniqlash.
3. Mijozlar oqimi to'xtab qolmasligi va bot qotib qolmasligini ta'minlash.
4. Har kuni 08:15 da Debraga turizm botlarining kunlik umumiy holatini xabar qilish.

---

## 3. Loyiha Bo'yicha Takliflar va Rivojlantirish Rejasi
1. **Bot javob tezligi SLA monitoringi:** Agar turizm botlaridan biri 3 soniyadan ortiq kechiksa, darhol ogohlantirish berish.
2. **AI FAQ assistenti:** Botlarga eng ko'p beriladigan savollar (narxlar, mavsumiy paketlar, viza talablari) bo'yicha 24/7 ishlaydigan aqlli yordamchi ulash.
3. **Mijozlar konversiyasi tahlili:** Qaysi bot (Riva, Zuhro, Dilrabo, Exotic) ko'proq lid keltirayotganini har haftalik hisobotda taqqoslash.
