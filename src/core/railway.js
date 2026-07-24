import { config } from './config.js';
import { log } from './logger.js';

const API = 'https://backboard.railway.com/graphql/v2';

async function gql(query, variables = {}) {
  if (!config.railway.token) throw new Error('RAILWAY_API_TOKEN sozlanmagan');
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.railway.token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'Railway API xatosi');
  return json.data;
}

/** Barcha loyihalar: id, nom, environment va service'lari. */
export async function listProjects() {
  const data = await gql(`query { me { workspaces { projects { edges { node {
    id name
    environments { edges { node { id name } } }
    services { edges { node { id name } } }
  } } } } } }`);

  return data.me.workspaces
    .flatMap((w) => w.projects.edges.map((e) => e.node))
    .map((p) => ({
      id: p.id,
      name: p.name,
      envId: p.environments.edges[0]?.node?.id ?? null,
      services: p.services.edges.map((e) => e.node),
    }));
}

/** Bitta service uchun oxirgi deployment. */
async function latestDeployment(projectId, serviceId, envId) {
  const data = await gql(
    `query($p:String!,$s:String!,$e:String!){
      deployments(first:1, input:{projectId:$p, serviceId:$s, environmentId:$e}){
        edges { node { id status createdAt } } } }`,
    { p: projectId, s: serviceId, e: envId },
  );
  return data.deployments.edges[0]?.node ?? null;
}

const OK_STATUS = new Set(['SUCCESS', 'DEPLOYING', 'BUILDING', 'INITIALIZING', 'WAITING', 'QUEUED']);
const DEAD_STATUS = new Set(['REMOVED', 'REMOVING']);

function statusLabel(status) {
  if (!status) return { icon: '❔', text: 'deployment yo\'q' };
  if (status === 'SUCCESS') return { icon: '✅', text: 'ishlayapti' };
  if (DEAD_STATUS.has(status)) return { icon: '⏸', text: 'to\'xtatilgan' };
  if (OK_STATUS.has(status)) return { icon: '🔄', text: status.toLowerCase() };
  return { icon: '❌', text: `MUAMMO (${status})` };
}

/** Hamma loyiha holati — hisobot uchun tayyor ma'lumot. */
export async function getAllStatus() {
  const projects = await listProjects();
  const out = [];

  for (const p of projects) {
    if (!p.envId) continue;
    const services = [];
    for (const s of p.services) {
      let dep = null;
      try {
        dep = await latestDeployment(p.id, s.id, p.envId);
      } catch (e) {
        log.warn(`Railway ${p.name}/${s.name}: ${e.message}`);
      }
      services.push({
        name: s.name,
        id: s.id,
        status: dep?.status ?? null,
        deploymentId: dep?.id ?? null,
        at: dep?.createdAt ?? null,
        ...statusLabel(dep?.status),
      });
    }
    out.push({ ...p, services });
  }
  return out;
}

/** Nomi bo'yicha loyihani topadi (qismiy moslik ham ishlaydi). */
export async function findProject(name) {
  const q = String(name || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return null;
  const projects = await listProjects();
  return (
    projects.find((p) => p.name.toLowerCase().replace(/\s+/g, '') === q) ??
    projects.find((p) => p.name.toLowerCase().replace(/\s+/g, '').includes(q)) ??
    null
  );
}

/** Loyihaning hamma service'ini to'xtatadi (mijoz to'lamaganda). */
export async function stopProject(name) {
  const p = await findProject(name);
  if (!p) return { ok: false, message: `"${name}" nomli loyiha topilmadi.` };

  const stopped = [];
  for (const s of p.services) {
    const dep = await latestDeployment(p.id, s.id, p.envId);
    if (!dep || DEAD_STATUS.has(dep.status)) continue;
    await gql(`mutation($id:String!){ deploymentStop(id:$id) }`, { id: dep.id });
    stopped.push(s.name);
  }

  log.info(`Railway: "${p.name}" to'xtatildi (${stopped.join(', ') || 'allaqachon to\'xtagan'})`);
  return {
    ok: true,
    message: stopped.length
      ? `"${p.name}" to'xtatildi. To'xtagan service'lar: ${stopped.join(', ')}`
      : `"${p.name}" allaqachon to'xtagan edi.`,
  };
}

/** Loyihani qayta ishga tushiradi (to'lov kelgach). */
export async function startProject(name) {
  const p = await findProject(name);
  if (!p) return { ok: false, message: `"${name}" nomli loyiha topilmadi.` };

  const started = [];
  for (const s of p.services) {
    await gql(
      `mutation($s:String!,$e:String!){ serviceInstanceRedeploy(serviceId:$s, environmentId:$e) }`,
      { s: s.id, e: p.envId },
    );
    started.push(s.name);
  }

  log.info(`Railway: "${p.name}" qayta ishga tushirildi (${started.join(', ')})`);
  return { ok: true, message: `"${p.name}" qayta ishga tushirildi: ${started.join(', ')}` };
}

/** Guruhga yuboriladigan holat hisoboti (HTML). */
export async function buildStatusReport() {
  const projects = await getAllStatus();
  const d = new Date();
  const lines = [
    `🖥 <b>Debra · Serverlar holati</b> · ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
    '',
  ];

  let problems = 0;
  for (const p of projects) {
    // Loyihaning umumiy holati — eng yomon service bo'yicha
    const bad = p.services.filter((s) => s.icon === '❌');
    const paused = p.services.filter((s) => s.icon === '⏸');
    if (bad.length) problems++;

    let icon = '✅';
    let note = 'ishlayapti';
    if (bad.length) {
      icon = '❌';
      note = `MUAMMO — ${bad.map((s) => `${s.name}: ${s.status}`).join(', ')}`;
    } else if (paused.length === p.services.length && p.services.length) {
      icon = '⏸';
      note = 'to\'xtatilgan';
    } else if (!p.services.length) {
      icon = '❔';
      note = 'service yo\'q';
    }

    lines.push(`${icon} <b>${p.name}</b> — ${note}`);
  }

  lines.push('', problems ? `⚠️ ${problems} ta loyihada muammo bor.` : 'Hammasi joyida.');
  return lines.join('\n');
}
