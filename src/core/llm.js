import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { log } from './logger.js';

const client = new Anthropic({ apiKey: config.llm.apiKey });

/** Qaysi model qaysi imkoniyatni qo'llaydi — noto'g'ri parametr 400 qaytaradi. */
function caps(model) {
  const adaptive = /^claude-(fable-5|opus-4-(6|7|8)|sonnet-(5|4-6))/.test(model);
  const effort = adaptive || /^claude-opus-4-5/.test(model);
  return { adaptive, effort };
}

/**
 * Modeldan sxemaga mos JSON oladi.
 * Structured outputs ishlamasa — matndan JSON ajratib olishga qaytadi.
 */
export async function askJson({ system, prompt, schema, maxTokens = 8000 }) {
  const model = config.llm.model;
  const { adaptive, effort } = caps(model);

  const base = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  if (adaptive) base.thinking = { type: 'adaptive' };
  if (effort) base.output_config = { effort: config.llm.effort };

  let text;
  try {
    const res = await client.messages.create({
      ...base,
      output_config: { ...(base.output_config ?? {}), format: { type: 'json_schema', schema } },
    });
    text = firstText(res);
  } catch (err) {
    log.warn('structured output ishlamadi, oddiy rejimga o\'tildi:', err.message);
    const res = await client.messages.create({
      ...base,
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nJavobni FAQAT quyidagi JSON Schema'ga mos JSON ko'rinishida qaytar, boshqa hech qanday matnsiz:\n${JSON.stringify(schema)}`,
        },
      ],
    });
    text = firstText(res);
  }

  return parseJson(text);
}

function firstText(res) {
  const block = res.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Modeldan matn bloki kelmadi');
  return block.text;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Model JSON'ni ```json ... ``` ichida yoki matn orasida qaytarishi mumkin
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1]);
    const braced = text.match(/\{[\s\S]*\}/);
    if (braced) return JSON.parse(braced[0]);
    throw new Error(`JSON ajratib bo'lmadi: ${text.slice(0, 200)}`);
  }
}
