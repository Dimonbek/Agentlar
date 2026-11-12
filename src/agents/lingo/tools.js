import { listObunalar, setObunaSana } from '../../core/db.js';
import { qolganKun, keyingiSana } from './index.js';
import { formatPul, obunaSomda } from '../../core/valyuta.js';

/** Layla ixtiyoridagi asboblar (Claude tool-use). */
export const laylaTools = [
  {
    name: 'list_subscriptions',
    description:
      "Dexterning barcha faol obunalari, xizmat to'lovlari (server, domen, API, servislar), " +
      "har birining keyingi to'lov sanasi, qolgan kunlar va oylik o'rtacha umumiy xarajatni qaytaradi. " +
      "To'lovlar, xarajatlar, qachon to'lash kerakligi yoki obunalar ro'yxati so'ralganda ALBATTA shu asbobni ishlat.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'mark_subscription_paid',
    description:
      "Obuna yoki xizmat to'langanda uning to'lov sanasini keyingi davrga (oylik bo'lsa keyingi oyga, yillik bo'lsa keyingi yilga) suradi. " +
      "Faqat Dexter aniq 'to'ladim', 'to'landi' yoki 'sanani yangila' deb topshirganda ishlat.",
    input_schema: {
      type: 'object',
      properties: {
        kalit: {
          type: 'string',
          description: "Obuna kaliti (masalan: 'hetzner', 'railway', 'anthropic', 'domain-uz'). list_subscriptions dan olinadi.",
        },
      },
      required: ['kalit'],
      additionalProperties: false,
    },
  },
];

export async function runLaylaTool(name, input) {
  if (name === 'list_subscriptions') {
    const obunalar = listObunalar({ onlyEnabled: true });
    if (!obunalar.length) {
      return {
        oylik_jami_som: 0,
        xabar: "Hozircha bazada faol obunalar mavjud emas.",
        obunalar: [],
      };
    }

    let jamiSom = 0;
    const royxat = await Promise.all(obunalar.map(async (o) => {
      const qoldi = qolganKun(o.sana);
      let holat = 'vaqt_bor';
      if (qoldi < 0) holat = 'otib_ketgan';
      else if (qoldi === 0) holat = 'bugun';
      else if (qoldi <= 3) holat = 'shoshilinch';
      else if (qoldi <= 7) holat = 'yaqinlashmoqda';

      const formatlangan = await formatPul(o);
      const som = await obunaSomda(o);
      jamiSom += (o.davr === 'yillik' ? som / 12 : som);

      return {
        kalit: o.kalit,
        nom: o.nom,
        summa_asl: `${o.summa} ${o.valyuta}`,
        summa: o.summa,
        valyuta: o.valyuta,
        summa_formatlangan: formatlangan,
        davr: o.davr,
        sana: o.sana,
        qolgan_kun: qoldi,
        holat,
        izoh: o.izoh || null,
      };
    }));

    // Qolgan kun bo'yicha saralash (eng shoshilinch / o'tib ketganlar yuqorida)
    royxat.sort((a, b) => a.qolgan_kun - b.qolgan_kun);

    return {
      oylik_ortacha_xarajat: Math.round(jamiSom),
      oylik_ortacha_xarajat_som: Math.round(jamiSom),
      jami_obunalar_soni: royxat.length,
      obunalar: royxat,
    };
  }

  if (name === 'mark_subscription_paid') {
    const obunalar = listObunalar();
    const obuna = obunalar.find((o) => o.kalit === input.kalit || o.nom?.toLowerCase() === input.kalit?.toLowerCase());

    if (!obuna) {
      return {
        xato: `'${input.kalit}' kaliti bilan obuna topilmadi. Avval list_subscriptions orqali aniqlang.`,
      };
    }

    const yangi = keyingiSana(obuna.sana, obuna.davr);
    if (!yangi) {
      return {
        xato: `'${obuna.nom}' bir martalik to'lov yoki noma'lum davr bo'lgani uchun sanasi avtomatik surilmadi.`,
      };
    }

    setObunaSana(obuna.kalit, yangi);
    return {
      muvaffaqiyatli: true,
      kalit: obuna.kalit,
      nom: obuna.nom,
      eski_sana: obuna.sana,
      yangi_sana: yangi,
      davr: obuna.davr,
      xabar: `${obuna.nom} uchun to'lov qabul qilindi. Keyingi to'lov sanasi: ${yangi}.`,
    };
  }

  throw new Error(`Noma'lum Layla asbobi: ${name}`);
}
