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
  source?: string;
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
  if (!s) return '';
  return s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
}

function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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

// Track which provider keys have failed with permanent errors
const failedProviderKeys = new Map<string, Set<string>>();

function markKeyFailed(providerId: string, key: string) {
  if (!failedProviderKeys.has(providerId)) failedProviderKeys.set(providerId, new Set());
  failedProviderKeys.get(providerId)!.add(key);
}

function isKeyFailed(providerId: string, key: string): boolean {
  return failedProviderKeys.get(providerId)?.has(key) || false;
}

export function resetFailedKeys() {
  failedProviderKeys.clear();
}

export async function callAIConsensus(
  apiKeys: Record<string, string[]>,
  messages: Array<{ role: string; content: string }>,
  expectedKeys: string[],
  onLog?: LogCallback
): Promise<Record<string, any>> {
  const activeProviders = Object.entries(PROVIDERS).filter(([id]) => {
    const keys = apiKeys[id] || [];
    // Filter out providers where all keys have failed
    const validKeys = keys.filter(k => !isKeyFailed(id, k));
    return validKeys.length > 0;
  });
  if (activeProviders.length === 0) throw new Error('No hay APIs configuradas o todas las claves fallaron');

  const results: Array<{ provider: string; data: Record<string, any> }> = [];
  const promises = activeProviders.map(async ([pid, p]) => {
    const keys = (apiKeys[pid] || []).filter(k => !isKeyFailed(pid, k));
    if (keys.length === 0) return;
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
          // Permanent failures - mark key as failed
          if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 412) {
            markKeyFailed(pid, key);
            continue;
          }
          if (res.status === 429) continue; // rate limit, try next key
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
        else if (e.message === 'Failed to fetch') {
          onLog?.(createLog(`🚫 ${p.name}: CORS bloqueado`, 'warn'));
          markKeyFailed(pid, key);
        }
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
    firstName: ['first', 'given', 'nombre', 'name', 'primer'],
    lastName: ['last', 'family', 'apellido', 'surname'],
    email: ['e-mail', 'email', 'correo', 'mail'],
    phone: ['phone', 'tel', 'celular', 'whatsapp', 'movil', 'mobile', 'cell'],
    company: ['organization', 'company', 'empresa', 'org', 'compañia'],
    title: ['title', 'cargo', 'puesto', 'job', 'position', 'rol']
  };
  headers.forEach(h => {
    const hl = normalizeStr(h);
    for (const [k, arr] of Object.entries(syn))
      if (!map[k] && arr.some(s => hl.includes(s))) map[k] = h;
  });
  return map;
}

// Cache mappings per header signature to avoid redundant AI calls
const mappingCache = new Map<string, Record<string, string>>();

async function getColumnMapping(
  headers: string[],
  useAI: boolean,
  apiKeys: Record<string, string[]>,
  onLog?: LogCallback
): Promise<Record<string, string>> {
  const cacheKey = headers.sort().join('|');
  if (mappingCache.has(cacheKey)) {
    onLog?.(createLog('📋 Usando mapeo en caché', 'info'));
    return mappingCache.get(cacheKey)!;
  }

  if (!useAI) {
    const result = heuristicMapping(headers);
    mappingCache.set(cacheKey, result);
    return result;
  }

  onLog?.(createLog('🤖 Solicitando mapeo de columnas...'));
  const prompt = `Dado estos encabezados: ${JSON.stringify(headers)}. Devuelve SOLO un JSON con: "firstName","lastName","email","phone","company","title". Asigna el nombre exacto del encabezado que corresponda a cada campo. Si no hay coincidencia, deja vacío.`;
  try {
    const res = await callAIConsensus(apiKeys, [
      { role: 'system', content: 'Eres un asistente que responde SOLO con JSON válido. Sin texto extra.' },
      { role: 'user', content: prompt }
    ], ['firstName', 'lastName', 'email', 'phone', 'company', 'title'], onLog);
    onLog?.(createLog(`📋 Mapeo consensuado (confianza: ${res._confidence?.toFixed(2)})`, 'ok'));
    mappingCache.set(cacheKey, res);
    return res;
  } catch {
    onLog?.(createLog('⚠️ Falló IA, usando heurística', 'warn'));
    const result = heuristicMapping(headers);
    mappingCache.set(cacheKey, result);
    return result;
  }
}

function cleanContactLocal(
  raw: Record<string, any>,
  mapping: Record<string, string>,
  source: string
): Contact {
  const get = (f: string) => mapping[f] ? String(raw[mapping[f]] || '') : '';
  let firstName = get('firstName'), lastName = get('lastName'), email = get('email'),
    phone = get('phone'), company = get('company'), title = get('title');

  if (!firstName && !lastName) {
    const full = raw['File As'] || raw.Name || raw.FN || raw.name || raw.nombre || '';
    if (full) {
      const parts = full.split(',');
      if (parts.length === 2) {
        lastName = parts[0].trim(); firstName = parts[1].trim();
      } else {
        const ws = full.trim().split(/\s+/);
        firstName = ws.slice(0, -1).join(' '); lastName = ws[ws.length - 1] || '';
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

  company = capitalize(company); title = capitalize(title);

  const confidence = (validPhone.startsWith('+') ? 0.5 : 0.2) + (cleanEmail ? 0.3 : 0) + (firstName ? 0.1 : 0) + (lastName ? 0.1 : 0);
  return { nombre: firstName, apellido: lastName, empresa: company, cargo: title, whatsapp: validPhone, email: cleanEmail, confidence, source };
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
  if (!s1 || !s2) return 0.0;
  const len1 = s1.length, len2 = s2.length;
  const maxDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  if (maxDist < 0) return 0.0;
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

  // Index by phone and email for O(1) lookups
  const phoneIndex = new Map<string, number[]>();
  const emailIndex = new Map<string, number[]>();
  const nameIndex = new Map<string, number[]>(); // normalized first+last name

  contacts.forEach((c, i) => {
    if (c.whatsapp) {
      const phone = c.whatsapp.replace(/\D/g, '');
      if (!phoneIndex.has(phone)) phoneIndex.set(phone, []);
      phoneIndex.get(phone)!.push(i);
    }
    if (c.email) {
      if (!emailIndex.has(c.email)) emailIndex.set(c.email, []);
      emailIndex.get(c.email)!.push(i);
    }
    const name = normalizeStr((c.nombre + ' ' + c.apellido).trim());
    if (name) {
      if (!nameIndex.has(name)) nameIndex.set(name, []);
      nameIndex.get(name)!.push(i);
    }
  });

  // First pass: exact matches by phone, email, and exact name
  for (let i = 0; i < contacts.length; i++) {
    if (used.has(i)) continue;
    const group = [contacts[i]]; used.add(i);
    const c = contacts[i];

    // Phone match
    if (c.whatsapp) {
      const phone = c.whatsapp.replace(/\D/g, '');
      for (const j of (phoneIndex.get(phone) || [])) {
        if (!used.has(j)) { group.push(contacts[j]); used.add(j); }
      }
    }

    // Email match
    if (c.email) {
      for (const j of (emailIndex.get(c.email) || [])) {
        if (!used.has(j)) { group.push(contacts[j]); used.add(j); }
      }
    }

    // Exact name match (catches duplicates with same name but different phone/email)
    const name = normalizeStr((c.nombre + ' ' + c.apellido).trim());
    if (name && name.length > 3) {
      for (const j of (nameIndex.get(name) || [])) {
        if (!used.has(j)) { group.push(contacts[j]); used.add(j); }
      }
    }

    groups.push(group);
  }

  // Second pass: fuzzy name matching between group representatives
  const merged: Contact[][] = [];
  const groupUsed = new Set<number>();
  for (let i = 0; i < groups.length; i++) {
    if (groupUsed.has(i)) continue;
    const superGroup = [...groups[i]];
    groupUsed.add(i);
    const nameA = normalizeStr((groups[i][0].nombre + ' ' + groups[i][0].apellido).trim());
    if (nameA && nameA.length > 3) {
      for (let j = i + 1; j < groups.length; j++) {
        if (groupUsed.has(j)) continue;
        const nameB = normalizeStr((groups[j][0].nombre + ' ' + groups[j][0].apellido).trim());
        if (nameB && jaroWinkler(nameA, nameB) >= threshold) {
          superGroup.push(...groups[j]);
          groupUsed.add(j);
        }
      }
    }
    merged.push(superGroup);
  }

  return merged.map(g => {
    if (g.length === 1) return g[0];
    const fields: (keyof Contact)[] = ['nombre', 'apellido', 'empresa', 'cargo', 'whatsapp', 'email'];
    const best = g.reduce((a, b) => fields.reduce((s, f) => s + (b[f] ? 1 : 0), 0) > fields.reduce((s, f) => s + (a[f] ? 1 : 0), 0) ? b : a);
    const result = { ...best };
    g.forEach(c => fields.forEach(f => { if (!result[f] && c[f]) (result as any)[f] = c[f]; }));
    result.confidence = Math.max(...g.map(c => c.confidence));
    return result;
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
  const { files, apiKeys, useAIForMapping, minConfidence, signal, onLog, onProgress, onLivePreview, isPaused } = opts;
  const allContacts: Contact[] = [];
  const lowConfidence: Contact[] = [];
  let totalRows = 0, empty = 0;

  // Reset failed keys at start of processing
  resetFailedKeys();
  mappingCache.clear();

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

      // Process rows in parallel batches for speed
      const batchSize = 50;
      for (let b = 0; b < rows.length; b += batchSize) {
        if (signal.aborted) throw new Error('Cancelado');
        while (isPaused()) await new Promise(r => setTimeout(r, 300));

        const batch = rows.slice(b, b + batchSize);
        const contacts = batch.map(r => cleanContactLocal(r, mapping, file.name));

        for (const c of contacts) {
          if (!c.whatsapp && !c.email && !c.nombre) { empty++; continue; }
          if (c.confidence < minConfidence) lowConfidence.push(c);
          else allContacts.push(c);
          totalRows++;
          if (totalRows % 25 === 0) onLivePreview(c);
        }
      }
      onProgress(i + 1, files.length);
    } catch (e: any) {
      if (e.message === 'Cancelado') throw e;
      onLog(createLog(`❌ Error en ${file.name}: ${e.message}`, 'err'));
    }
  }

  onLog(createLog(`📊 Contactos válidos: ${allContacts.length} (omitidos vacíos: ${empty})`));
  const deduped = deduplicateContacts(allContacts);
  const removedDupes = allContacts.length - deduped.length;
  onLog(createLog(`🔗 Deduplicados: ${allContacts.length} → ${deduped.length} (${removedDupes} duplicados eliminados)`, 'ok'));
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
