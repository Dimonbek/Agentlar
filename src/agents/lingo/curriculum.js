/**
 * 30 kunlik ingliz tili rejasi.
 * Maqsad: ko'rgan matnni o'qib tushunish + ingliz tilida javob yoza olish.
 * Daraja: noldan A2 gacha, dasturchi/tadbirkor kundalik ehtiyojiga moslangan.
 */
export const CURRICULUM = [
  { day: 1, topic: 'Salomlashish va tanishuv', focus: 'Hello / My name is / Nice to meet you' },
  { day: 2, topic: 'To be fe\'li (am / is / are)', focus: 'I am, he is, they are — tasdiq, inkor, savol' },
  { day: 3, topic: 'Shaxs olmoshlari va egalik', focus: 'I/you/he/she + my/your/his/her' },
  { day: 4, topic: 'Oddiy hozirgi zamon (Present Simple)', focus: 'I work, he works — kundalik ish-harakat' },
  { day: 5, topic: 'Savol berish (do / does)', focus: 'Do you...? Does he...? — savol tuzish' },
  { day: 6, topic: 'Kundalik tartib (daily routine)', focus: 'wake up, go to work, have lunch' },
  { day: 7, topic: 'Vaqt, kun va sana', focus: 'What time is it? on Monday, in July' },
  { day: 8, topic: 'Birinchi hafta takrorlash', focus: '1-7 kunlar bo\'yicha amaliy mashq' },
  { day: 9, topic: 'Oila va odamlar', focus: 'family, friend, colleague + tavsiflash' },
  { day: 10, topic: 'There is / There are', focus: 'bor/yo\'q — narsalar va joylar haqida' },
  { day: 11, topic: 'Sifatlar va tavsif', focus: 'big, small, expensive, useful' },
  { day: 12, topic: 'Hozirgi davomli zamon (Present Continuous)', focus: 'I am working now — ayni damda' },
  { day: 13, topic: 'Present Simple va Continuous farqi', focus: 'I work / I am working' },
  { day: 14, topic: 'Ovqat, kafe va buyurtma', focus: 'I would like, menu, order' },
  { day: 15, topic: 'Ikkinchi hafta takrorlash', focus: '9-14 kunlar bo\'yicha amaliy mashq' },
  { day: 16, topic: 'Son, narx va xarid', focus: 'How much is it? numbers, prices' },
  { day: 17, topic: 'O\'tgan zamon: was / were', focus: 'I was, they were — o\'tmishdagi holat' },
  { day: 18, topic: 'Past Simple (to\'g\'ri fe\'llar)', focus: 'worked, played, started' },
  { day: 19, topic: 'Past Simple (noto\'g\'ri fe\'llar)', focus: 'go-went, have-had, make-made' },
  { day: 20, topic: 'Sayohat va yo\'nalish so\'rash', focus: 'Where is...? turn left, ticket' },
  { day: 21, topic: 'Kelasi zamon: will / going to', focus: 'I will call, I am going to start' },
  { day: 22, topic: 'Uchinchi hafta takrorlash', focus: '16-21 kunlar bo\'yicha amaliy mashq' },
  { day: 23, topic: 'Modal fe\'llar: can / must / should', focus: 'imkoniyat, majburiyat, maslahat' },
  { day: 24, topic: 'Taqqoslash (comparatives)', focus: 'faster, better, more useful' },
  { day: 25, topic: 'Eng ustun daraja (superlatives)', focus: 'the best, the fastest' },
  { day: 26, topic: 'Texnologiya va internet', focus: 'code, app, server, update — kasbiy lug\'at' },
  { day: 27, topic: 'Fikr bildirish', focus: 'I think, in my opinion, I agree / disagree' },
  { day: 28, topic: 'Yozishma: email va xabar', focus: 'Dear, Best regards, rasmiy/norasmiy uslub' },
  { day: 29, topic: 'Muammo va yechim', focus: 'shikoyat, so\'rov, yordam so\'rash' },
  { day: 30, topic: 'Yakuniy takrorlash va erkin suhbat', focus: 'o\'rganilganlarni birlashtirish' },
];

export function lessonFor(day) {
  return CURRICULUM.find((c) => c.day === day) ?? null;
}

export const TOTAL_DAYS = CURRICULUM.length;
