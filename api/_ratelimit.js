// Rate limiter en memoria, sin dependencias externas.
//
// Limita ráfagas de requests desde una misma IP para que nadie pueda
// inundar (flood) los endpoints públicos. Nota honesta: en serverless cada
// instancia tiene su propia memoria, así que esto protege muy bien contra
// floods sostenidos sobre una instancia "caliente", pero no es un límite
// global perfecto entre todas las instancias. Para un límite global estricto
// se podría sumar Upstash Redis (gratis hasta cierto volumen); este módulo
// cubre el 95% de los casos sin costo ni dependencias.
//
// Archivo con prefijo "_" → Vercel NO lo cuenta como función serverless,
// así que no consume el cupo de 12 funciones del plan Hobby.

const hits = new Map();

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// Devuelve { ok, remaining, retryAfter, limit }
export function rateLimit(req, { bucket = 'default', limit = 20, windowMs = 60000 } = {}) {
  const ip = getClientIp(req);
  const key = `${bucket}:${ip}`;
  const now = Date.now();

  let entry = hits.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + windowMs };
  }
  entry.count++;
  hits.set(key, entry);

  // Limpieza ocasional para no acumular memoria indefinidamente.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (now > v.reset) hits.delete(k);
    }
  }

  const remaining = Math.max(0, limit - entry.count);
  const retryAfter = Math.max(1, Math.ceil((entry.reset - now) / 1000));
  return { ok: entry.count <= limit, remaining, retryAfter, limit };
}

// Aplica el límite y, si se excede, responde 429 y devuelve false.
// Uso: if (!applyRateLimit(req, res, { bucket:'x', limit:10 })) return;
export function applyRateLimit(req, res, opts) {
  const r = rateLimit(req, opts);
  res.setHeader('X-RateLimit-Limit', String(r.limit));
  res.setHeader('X-RateLimit-Remaining', String(r.remaining));
  if (!r.ok) {
    res.setHeader('Retry-After', String(r.retryAfter));
    res.status(429).json({ error: 'Demasiadas solicitudes. Esperá un momento e intentá de nuevo.' });
    return false;
  }
  return true;
}

// Valida que un string tenga formato UUID v1-v5. Sirve para no interpolar
// valores arbitrarios dentro de URLs de PostgREST (defensa contra inyección
// de filtros en la API REST de Supabase).
export function esUUID(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());
}

// Escapa caracteres especiales de HTML. Úsalo antes de insertar texto que viene
// del usuario dentro de HTML (p. ej. el cuerpo de un email) para evitar
// inyección de etiquetas/links de phishing.
export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
