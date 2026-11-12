import { listXatolar } from '../../core/db.js';

/** Sara ixtiyoridagi asboblar (Claude tool-use). */
export const saraTools = [
  {
    name: 'get_recent_errors',
    description:
      "Docker konteynerlari va tizim xizmatlari (systemd) jurnallaridan topilgan oxirgi xatoliklarni chiqaradi. " +
      "'Qanday xatolar bor?', 'tizimda muammo bormi?', 'oxirgi xatolar nima bo'ldi?' deb so'ralganda ALBATTA shu asbobni ishlat.",
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: "Nechta oxirgi xatolikni olish (sukut bo'yicha: 10, eng ko'pi: 30).",
        },
        manba: {
          type: 'string',
          description: "Muayyan servis yoki konteyner nomi bo'yicha filtrlash (ixtiyoriy).",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export async function runSaraTool(name, input = {}) {
  if (name === 'get_recent_errors') {
    const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 30);
    const manbaFilter = input.manba ? String(input.manba).toLowerCase().trim() : null;

    const barcha = listXatolar(50);
    const filterlangan = manbaFilter
      ? barcha.filter((x) => x.manba.toLowerCase().includes(manbaFilter))
      : barcha;

    const xatolar = filterlangan.slice(0, limit).map((x) => ({
      manba: x.manba,
      xabar_namuna: x.xabar,
      takrorlanish_soni: x.soni,
      birinchi_kuzatilgan: new Date(x.birinchi).toISOString(),
      oxirgi_kuzatilgan: new Date(x.oxirgi).toISOString(),
    }));

    if (!xatolar.length) {
      return {
        jami_xatolar_soni: 0,
        xabar: manbaFilter
          ? `'${manbaFilter}' bo'yicha jurnallarda hech qanday xatolik qayd etilmagan.`
          : "Hozircha jurnallarda hech qanday jiddiy xatolik qayd etilmagan, barcha xizmatlar toza ishlamoqda.",
        xatolar: [],
      };
    }

    return {
      jami_xatolar_soni: xatolar.length,
      xatolar,
    };
  }

  throw new Error(`Noma'lum Sara asbobi: ${name}`);
}
