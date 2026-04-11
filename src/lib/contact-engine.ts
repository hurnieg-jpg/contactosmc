import { PROVIDERS } from './providers';
import { type CachedFile } from './file-cache';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { parsePhoneNumber } from 'libphonenumber-js';

export interface Contact {
  id?: number;
  nombre: string;
  apellido: string;
  empresa: string;
  cargo: string;
  whatsapp: string;
  email: string;
  confidence: number;
}

export interface LogEntry {
  time: string;
  message: string;
  type: 'ok' | 'err' | 'warn' | 'ai' | 'info';
}

type LogCallback = (entry: LogEntry) => void;
type ProgressCallback = (current: number, total: number) => void;
type LivePreviewCallback = (contact: Contact) => void;

function createLog(message: string, type: LogEntry['type'] = 'info'): LogEntry {
  return { time: new Date().toLocaleTimeString(), message, type };
}

function capitalize(s: string): string {
  return s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
}

export function loadApiKeys(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem('cu_v16') || '{}');
  } catch {
    return {};
  }
}

export function saveApiKeys(keys: Record<string, string[]>) {
  localStorage.setItem('cu_v16', JSON.stringify(keys));
}

export async function callAIConsensus(
  apiKeys: Record<string, string[]>,
  messages: Array<{ role: string; content: string }>,
  expectedKeys: string[],
  onLog?: LogCallback
): Promise<Record<string, any>> {
  const activeProviders = Object.entries(PROVIDERS).filter(([id]) => apiKeys[id]?.length > 0);
  if (activeProviders.length === 0) throw new Error('No hay APIs configuradas');

  const results: Array<{ provider: string; data: Record<string, any> }> = [];
  const promises = activeProviders.map(async ([pid, p]) => {
    const keys = apiKeys[pid] || [];
    onLog?.(createLog(`🔍 Intentando ${p.emoji} ${p.name} (${keys.length} clave(s))...`));
    for (const key of keys) {
      const masked = key.slice(0, 5) + '...' + key.slice(-3);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let url = p.endpoint;
        if (p.urlWithKey) url = p.urlWithKey(url, key);
        const res = await fetch(url, {
          method: 'POST',
          headers: p.headers(key),
          body: p.body(messages),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const errText = await res.text();
          onLog?.(createLog(`⚠️ ${p.name} (${masked}): HTTP ${res.status} - ${errText.substring(0, 100)}`, 'warn'));
          if (res.status === 429 || res.status === 403 || res.status === 401) continue;
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        let parsed: Record<string, any>;
        try {
          const raw = p.parse(data);
          parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          onLog?.(createLog(`❌ ${p.name} no devolvió JSON válido`, 'err'));
          continue;
        }
        if (!expectedKeys.some(k => parsed[k] !== undefined)) {
          onLog?.(createLog(`❌ ${p.name} respuesta sin claves esperadas`, 'err'));
          continue;
        }
        results.push({ provider: pid, data: parsed });
        onLog?.(createLog(`✅ ${p.emoji} ${p.name} (${masked}) respondió OK`, 'ai'));
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') onLog?.(createLog(`⏰ ${p.name} timeout`, 'warn'));
        else onLog?.(createLog(`❌ ${p.name} error: ${e.message}`, 'err'));
      }
    }
    onLog?.(createLog(`🚫 ${p.name} sin claves válidas`, 'warn'));
  });

  await Promise.allSettled(promises);
  if (results.length === 0) throw new Error('Ninguna IA pudo responder');

  onLog?.(createLog(`📊 ${results.length} IAs contribuyeron al consenso`, 'ok'));
  const final: Record<string, any> = {};
  for (const key of expectedKeys) {
    const votes: Record<string, number> = {};
    results.forEach(r => {
      const val = r.data[key];
      if (val !== undefined && val !== null) votes[String(val)] = (votes[String(val)] || 0) + 1;
    });
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    final[key] = winner ? winner[0] : '';
  }
  final._confidence = results.length / activeProviders.length;
  return final;
}

function heuristicMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const syn: Record<string, string[]> = {
    firstName: ['first', 'given', 'nombre'],
    lastName: ['last', 'family', 'apellido'],
    email: ['e-mail', 'email', 'correo'],
    phone: ['phone', 'tel', 'celular', 'whatsapp'],
    company: ['organization', 'company', 'empresa'],
    title: ['title', 'cargo', 'puesto']
  };
  headers.forEach(h => {
    const hl = h.toLowerCase();
    for (const [k, arr] of Object.entries(syn))
      if (!map[k] && arr.some(s => hl.includes(s))) map[k] = h;
  });
  return map;
}

async function getColumnMapping(
  headers: string[],
  useAI: boolean,
  apiKeys: Record<string, string[]>,
  onLog?: LogCallback
): Promise<Record<string, string>> {
  if (!useAI) return heuristicMapping(headers);
  onLog?.(createLog('🤖 Solicitando mapeo de columnas...'));
  const prompt = `Dado estos encabezados: ${JSON.stringify(headers)}. Devuelve SOLO un JSON con: "firstName","lastName","email","phone","company","title". Asigna el nombre exacto del encabezado.`;
  try {
    const res = await callAIConsensus(apiKeys, [{ role: 'user', content: prompt }], ['firstName', 'lastName', 'email', 'phone', 'company', 'title'], onLog);
    onLog?.(createLog(`📋 Mapeo consensuado (confianza: ${res._confidence?.toFixed(2)})`, 'ok'));
    return res;
  } catch {
    onLog?.(createLog('⚠️ Falló IA, usando heurística', 'warn'));
    return heuristicMapping(headers);
  }
}

async function cleanContactWithAI(
  raw: Record<string, any>,
  mapping: Record<string, string>,
  useAICleaning: boolean,
  apiKeys: Record<string, string[]>,
  onLog?: LogCallback
): Promise<Contact> {
  const get = (f: string) => mapping[f] ? String(raw[mapping[f]] || '') : '';
  let firstName = get('firstName'), lastName = get('lastName'), email = get('email'),
    phone = get('phone'), company = get('company'), title = get('title');

  if (!firstName && !lastName) {
    const full = raw['File As'] || raw.Name || raw.FN || '';
    if (full) {
      if (useAICleaning) {
        try {
          const ai = await callAIConsensus(apiKeys, [{ role: 'user', content: `Extrae nombre y apellido de: "${full}". JSON con "firstName","lastName".` }], ['firstName', 'lastName'], onLog);
          firstName = ai.firstName; lastName = ai.lastName;
        } catch { /* fallback below */ }
      }
      if (!firstName) {
        const parts = full.split(',');
        if (parts.length === 2) {
          lastName = parts[0].trim(); firstName = parts[1].trim();
        } else {
          const ws = full.trim().split(/\s+/);
          firstName = ws.slice(0, -1).join(' '); lastName = ws[ws.length - 1] || '';
        }
      }
    }
  }
  firstName = capitalize(firstName); lastName = capitalize(lastName);

  let validPhone = '';
  const phoneCandidates = phone.split(/[;,:::]+/).map(p => p.replace(/[^\d+]/g, '')).filter(p => p.length >= 8);
  for (const p of phoneCandidates) {
    try { const parsed = parsePhoneNumber(p, 'AR'); if (parsed?.isValid()) { validPhone = parsed.format('E.164'); break; } } catch { /* */ }
    try { const parsed = parsePhoneNumber(p); if (parsed?.isValid()) { validPhone = parsed.format('E.164'); break; } } catch { /* */ }
  }
  if (!validPhone && phoneCandidates.length) validPhone = '?' + phoneCandidates[0];

  let cleanEmail = email.toLowerCase().trim();
  if (cleanEmail && !cleanEmail.includes('@')) cleanEmail = '';

  if (!company && !title && useAICleaning) {
    const notes = raw.Notes || raw.notes || '';
    if (notes.length > 10) {
      try {
        const ai = await callAIConsensus(apiKeys, [{ role: 'user', content: `Extrae empresa y cargo de: "${notes.substring(0, 500)}". JSON con "company","title".` }], ['company', 'title'], onLog);
        company = ai.company; title = ai.title;
      } catch { /* */ }
    }
  }
  company = capitalize(company); title = capitalize(title);

  const confidence = (validPhone.startsWith('+') ? 0.5 : 0.2) + (cleanEmail ? 0.3 : 0) + (firstName ? 0.1 : 0) + (lastName ? 0.1 : 0);
  return { nombre: firstName, apellido: lastName, empresa: company, cargo: title, whatsapp: validPhone, email: cleanEmail, confidence };
}

export function parseFile(file: CachedFile): Promise<Record<string, any>[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'csv' || ext === 'txt') {
    const text = new TextDecoder().decode(file.content);
    return new Promise((res, rej) =>
      Papa.parse(text, { header: true, skipEmptyLines: true, complete: r => res(r.data as Record<string, any>[]), error: rej })
    );
  }
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const wb = XLSX.read(new Uint8Array(file.content), { type: 'array' });
      const rows: Record<string, any>[] = [];
      wb.SheetNames.forEach(n => rows.push(...(XLSX.utils.sheet_to_json(wb.Sheets[n]) as Record<string, any>[])));
      return Promise.resolve(rows);
    } catch (err) {
      return Promise.reject(err);
    }
  }
  if (ext === 'vcf' || ext === 'vcard') {
    const text = new TextDecoder().decode(file.content);
    const vcards = text.split(/END:VCARD/i).filter(p => p.includes('BEGIN:VCARD'));
    const rows: Record<string, any>[] = [];
    vcards.forEach(v => {
      const obj: Record<string, any> = {};
      let fn = '';
      v.split(/\r?\n/).forEach(l => {
        const [prop, ...rest] = l.split(':');
        const val = rest.join(':').trim();
        const p = prop.toUpperCase().split(';')[0];
        if (p === 'FN') fn = val;
        else if (p === 'N') { const parts = val.split(';'); obj.last_name = parts[0]; obj.first_name = parts[1]; }
        else if (p === 'ORG') obj.empresa = val;
        else if (p === 'TITLE') obj.cargo = val;
        else if (p === 'TEL') obj.phone = val;
        else if (p === 'EMAIL') obj.email = val;
      });
      if (!obj.first_name && fn) {
        const parts = fn.trim().split(/\s+/);
        obj.first_name = parts.slice(0, -1).join(' ');
        obj.last_name = parts[parts.length - 1] || '';
      }
      rows.push(obj);
    });
    return Promise.resolve(rows);
  }
  return Promise.resolve([]);
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const len1 = s1.length, len2 = s2.length;
  const maxDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  let match = 0;
  const hash1 = new Array(len1).fill(0);
  const hash2 = new Array(len2).fill(0);
  for (let i = 0; i < len1; i++) {
    for (let j = Math.max(0, i - maxDist); j < Math.min(len2, i + maxDist + 1); j++) {
      if (s1[i] === s2[j] && hash2[j] === 0) { hash1[i] = 1; hash2[j] = 1; match++; break; }
    }
  }
  if (match === 0) return 0.0;
  let t = 0, point = 0;
  for (let i = 0; i < len1; i++) if (hash1[i]) { while (hash2[point] === 0) point++; if (s1[i] !== s2[point++]) t++; }
  t /= 2;
  const jaro = (match / len1 + match / len2 + (match - t) / match) / 3.0;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) if (s1[i] === s2[i]) prefix++; else break;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export function deduplicateContacts(contacts: Contact[], threshold = 0.85): Contact[] {
  const used = new Set<number>();
  const groups: Contact[][] = [];
  for (let i = 0; i < contacts.length; i++) {
    if (used.has(i)) continue;
    const group = [contacts[i]]; used.add(i);
    for (let j = i + 1; j < contacts.length; j++) {
      if (used.has(j)) continue;
      const a = contacts[i], b = contacts[j];
      if ((a.whatsapp && b.whatsapp && a.whatsapp.replace(/\D/g, '') === b.whatsapp.replace(/\D/g, ''))
        || (a.email && b.email && a.email === b.email)) {
        group.push(b); used.add(j); continue;
      }
      const nameA = (a.nombre + ' ' + a.apellido).trim().toLowerCase();
      const nameB = (b.nombre + ' ' + b.apellido).trim().toLowerCase();
      if (nameA && nameB && jaroWinkler(nameA, nameB) >= threshold) { group.push(b); used.add(j); }
    }
    groups.push(group);
  }
  return groups.map(g => {
    if (g.length === 1) return g[0];
    const fields: (keyof Contact)[] = ['nombre', 'apellido', 'empresa', 'cargo', 'whatsapp', 'email'];
    const best = g.reduce((a, b) => fields.reduce((s, f) => s + (b[f] ? 1 : 0), 0) > fields.reduce((s, f) => s + (a[f] ? 1 : 0), 0) ? b : a);
    const merged = { ...best };
    g.forEach(c => fields.forEach(f => { if (!merged[f] && c[f]) (merged as any)[f] = c[f]; }));
    return merged;
  });
}

export interface ProcessOptions {
  files: CachedFile[];
  apiKeys: Record<string, string[]>;
  useAIForMapping: boolean;
  useAIForCleaning: boolean;
  minConfidence: number;
  signal: AbortSignal;
  onLog: LogCallback;
  onProgress: ProgressCallback;
  onLivePreview: LivePreviewCallback;
  isPaused: () => boolean;
}

export async function processContacts(opts: ProcessOptions): Promise<{ contacts: Contact[]; lowConfidence: Contact[] }> {
  const { files, apiKeys, useAIForMapping, useAIForCleaning, minConfidence, signal, onLog, onProgress, onLivePreview, isPaused } = opts;
  const allContacts: Contact[] = [];
  const lowConfidence: Contact[] = [];
  let totalRows = 0, empty = 0;

  for (let i = 0; i < files.length; i++) {
    if (signal.aborted) throw new Error('Cancelado');
    while (isPaused()) await new Promise(r => setTimeout(r, 300));

    const file = files[i];
    onLog(createLog(`📄 ${file.name} (${i + 1}/${files.length})`));
    try {
      const rows = await parseFile(file);
      if (!rows.length) { onProgress(i + 1, files.length); continue; }
      const headers = Object.keys(rows[0]);
      const mapping = await getColumnMapping(headers, useAIForMapping, apiKeys, onLog);

      for (const r of rows) {
        if (signal.aborted) throw new Error('Cancelado');
        const c = await cleanContactWithAI(r, mapping, useAIForCleaning, apiKeys, onLog);
        if (!c.whatsapp && !c.email) { empty++; continue; }
        if (c.confidence < minConfidence) lowConfidence.push(c);
        else allContacts.push(c);
        totalRows++;
        if (totalRows % 10 === 0) onLivePreview(c);
      }
      onProgress(i + 1, files.length);
    } catch (e: any) {
      if (e.message === 'Cancelado') throw e;
      onLog(createLog(`❌ Error en ${file.name}: ${e.message}`, 'err'));
    }
  }

  onLog(createLog(`📊 Contactos válidos: ${allContacts.length} (omitidos vacíos: ${empty})`));
  const deduped = deduplicateContacts(allContacts);
  onLog(createLog(`🔗 Deduplicados: ${allContacts.length} → ${deduped.length}`, 'ok'));
  return { contacts: deduped, lowConfidence };
}

export function exportCSV(contacts: Contact[]): string {
  const header = 'Nombre,Apellido,Empresa,Cargo,WhatsApp,Email,Confianza';
  const rows = contacts.map(c =>
    `"${c.nombre || ''}","${c.apellido || ''}","${c.empresa || ''}","${c.cargo || ''}","${c.whatsapp || ''}","${c.email || ''}",${c.confidence || ''}`
  );
  return '\uFEFF' + [header, ...rows].join('\n');
}

export function exportVCF(contacts: Contact[]): string {
  return contacts.map(c =>
    `BEGIN:VCARD\nVERSION:3.0\nN:${c.apellido || ''};${c.nombre || ''};;;\nFN:${c.nombre || ''} ${c.apellido || ''}\nORG:${c.empresa || ''}\nTITLE:${c.cargo || ''}\nTEL:${c.whatsapp || ''}\nEMAIL:${c.email || ''}\nEND:VCARD`
  ).join('\n');
}

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
