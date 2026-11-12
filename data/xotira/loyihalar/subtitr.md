# Subtitr.uz Loyihasi Pasporti

* **Mas'ul Agent:** Sara 🔎 (Subtitr tizimi va Xavfsizlik nazorati)
* **Status:** Faol ishlab turibdi

---

## 1. Loyihalar Tarkibi

### 1.1. Subtitr Veb-sayti
* **Kalit:** `subtitr-web`
* **Veb-manzil:** `https://subtitr.uz`
* **Konteyner:** `subtitr` (Docker)
* **Vazifasi:** O'zbek tilidagi videolarga AI yordamida avtomatik va aniq subtitr yaratish, video tahrirlash platformasi.

### 1.2. Subtitr Admin Paneli
* **Manzillar:** `https://subtitr.uz/admin`, `https://subtitr.uz/motion`
* **Vazifasi:** Foydalanuvchilar, generatsiyalar, obunalar va tizim sozlamalarini boshqarish.

### 1.3. Subtitr Telegram Boti
* **Vazifasi:** Foydalanuvchilarga video yuborish va tayyor subtitrli videoni qaytarish.

---

## 2. Xavflar va Maxsus Nazorat Qoidalari
* **Katta video yuklamalar:** Foydalanuvchilar katta hajmdagi videolar yuklaganda RAM va CPU yuki keskin oshishi mumkin.
* **Xatolar tahlili:** Jurnallardan (Docker logs) FFmpeg, GPU/CPU yoki audio transkripsiya xatolarini ushlash.
* **Xavfsizlik:** Admin panelga ruxsatsiz kirish urinishlari va bot orqali g'alati fayllar yuborilishini nazorat qilish.

---

## 3. Mas'ul Sara'ning Vazifalari
1. Subtitr sayti, admin panel va botining 24/7 rejimda to'g'ri ishlashini kuzatish.
2. Xatoliklar jurnallarini muntazam tahlil qilib, takrorlanuvchi muammolarni bartaraf etish uchun bildirishnoma tayyorlash.
3. Shubhali foydalanuvchi xatti-harakatlari yoki serverga ortiqcha yuk tushsa, zudlik bilan signal berish.
4. Har kuni 08:15 da Debraga Subtitr bo'yicha tunda yuz bergan voqealar va joriy holatni taqdim etish.

---

## 4. Loyiha Bo'yicha Takliflar va Rivojlantirish Rejasi
1. **FFmpeg render navbatida avto-retry:** Video qayta ishlashda kutilmagan uzilish yuz bersa, navbatdagi vazifani avtomatik bir marta qayta ishga tushirish.
2. **Admin paneliga 2FA yoki IP-chegaralash:** `/admin` va `/motion` yo'llariga begona kirishlar va brute-force urinishlarining oldini olish uchun Telegram orqali bir martalik tasdiq kodi kiritish.
3. **Eski video keshlarini tozalash:** 24 soatdan ortiq saqlangan vaqtinchalik video bo'laklarini avtomatik o'chirish orqali VPS diskini toza saqlash.
