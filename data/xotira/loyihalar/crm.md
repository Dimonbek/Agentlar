# CRM Tizimlari Pasporti

* **Mas'ul Agent:** Debra 🗂 (Boshliq / Detektor)
* **Status:** Faol nazorat ostida

---

## 1. Loyihalar Tarkibi

### 1.1. DimoCRM (Asosiy CRM)
* **Kalit:** `crm`
* **Vazifasi:** Dexter va mijozlar uchun umumiy boshqaruv, kontaktlar va hisobotlar platformasi.
* **Texnologiya:** Next.js (Node.js) + PostgreSQL
* **Asosiy URL:** `https://crm-production-b0de.up.railway.app/`
* **Zaxira / Mahalliy domen:** `https://crm.45-92-173-191.sslip.io` (va rejalashtirilgan `dimocrm.uz`)
* **Port:** 3000 (VPS da systemd ostida)

### 1.2. Exotic CRM
* **Kalit:** `exotic-crm-web` / `exotic-crm`
* **Vazifasi:** Exotic Tour sayyohlik agentligining lidlari, bitimlari va menejerlar aloqasini boshqarish.
* **Integratsiya:** Telegram botdan (`@exotictour_bot`) webhook orqali `/api/webhook` ga tushadi.
* **Manzil:** `https://crm.45-92-173-191.sslip.io`

### 1.3. KGF CRM (Rejalashtirilgan)
* **Status:** Keyinchalik tizimga qo'shiladi.
* **Vazifasi:** Kokand Gold Future zavodi bo'yicha mijozlar va shartnomalar bazasi.

---

## 2. Mas'ul Debra'ning Vazifalari
1. DimoCRM va Exotic CRM tizimlarining uzluksiz ishlashini tekshirish.
2. Botlardan CRM ga tushayotgan lidlar oqimi to'xtab qolmasligini kuzatish.
3. Yangi mijozlar va tushgan lidlar soni bo'yicha ertalab 08:30 da Dexterga hisobot berish.
4. Serverdan yoki Railway'dan mijoz loyihalarini to'xtatish/yoqish (`stop_project`, `start_project`).

---

## 3. Loyiha Bo'yicha Takliflar va Rivojlantirish Rejasi
1. **Lidlar uchun avtomatlashtirilgan push-bildirishnoma:** Exotic CRM ga Telegram botdan yangi lid tushgan zahoti menejerlar guruhiga darhol tezkor xabar borishi.
2. **KGF CRM ni integratsiya qilish:** KGF CRM ni noldan alohida loyiha sifatida yozmasdan, DimoCRM ichiga ko'p tashkilotli (multi-tenant) modul sifatida kiritish — bu server xarajatlarini tejaydi va bitta oynadan boshqarish imkonini beradi.
3. **Avtomatik zaxira nusxasi (Backup):** CRM ma'lumotlar bazasining har tun soat 03:00 da avtomatik zaxira nusxasini olib, shifrlangan holda alohida xavfsiz saqlash.
