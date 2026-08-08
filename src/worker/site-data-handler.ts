// Handles: editable page content (save/get) and AI-assisted tour submissions

import { sendEmail } from './contact-handler';

export interface Env {
  SITE_DATA: KVNamespace;
  OPENROUTER_API_KEY: string;
  RESEND_API_KEY: string;
  AI: any;
}

const ADMIN_EMAIL = 'dstevo191@gmail.com';

function escapeHtmlServer(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

async function notifyAdmin(env: Env, subject: string, html: string): Promise<void> {
  try {
    await sendEmail(env, ADMIN_EMAIL, subject, html);
  } catch (e) {
    console.error('admin notification failed', e);
  }
}

// ---------- Editable content boxes (nosotros, negocio, etc.) ----------

export async function handleSaveContent(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ page: string; field: string; value: string }>();
    if (!body.page || !body.field) {
      return json({ success: false, message: 'Faltan datos' }, 400);
    }
    await env.SITE_DATA.put(`content:${body.page}:${body.field}`, body.value || '');

    if (body.value && body.value.trim()) {
      await notifyAdmin(
        env,
        `Quechua Aventuras — Luis guardó texto (${body.page})`,
        `<h2>Luis guardó contenido</h2>
         <p><strong>Página:</strong> ${escapeHtmlServer(body.page)}</p>
         <p><strong>Campo:</strong> ${escapeHtmlServer(body.field)}</p>
         <blockquote style="border-left:3px solid #D9A544;padding-left:12px;color:#241C15;">${escapeHtmlServer(body.value).replace(/\n/g, '<br>').slice(0, 1000)}</blockquote>`
      );
    }

    return json({ success: true, message: 'Guardado' });
  } catch (e) {
    console.error('save-content error', e);
    return json({ success: false, message: 'Error al guardar' }, 500);
  }
}

export async function handleGetContent(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const page = url.searchParams.get('page');
    if (!page) return json({ success: false, message: 'Falta página' }, 400);

    const prefix = `content:${page}:`;
    const list = await env.SITE_DATA.list({ prefix });
    const data: Record<string, string> = {};
    for (const key of list.keys) {
      const field = key.name.slice(prefix.length);
      data[field] = (await env.SITE_DATA.get(key.name)) || '';
    }
    return json({ success: true, data });
  } catch (e) {
    console.error('get-content error', e);
    return json({ success: false, message: 'Error al cargar' }, 500);
  }
}

// ---------- Tour submissions (Luis gives the basics, AI fills the rest) ----------

interface TourSubmission {
  name: string;
  countries: string[];
  price: string;
  route?: string;
  knownDays?: string;
  notes?: string;
}

interface EnrichedTour extends TourSubmission {
  slug: string;
  description: string;
  days: string;
  distanceKm: string;
  elevationGainM: string;
  maxAltitudeM: string;
  difficulty: string;
  bestSeason: string;
  highlights: string[];
  itinerary: { day: number; title: string; detail: string }[];
  photos: string[];
  createdAt: string;
  aiGenerated: boolean;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function enrichTourWithAI(tour: TourSubmission, env: Env): Promise<Partial<EnrichedTour>> {
  const multiCountry = tour.countries.length > 1;
  const daysHint = tour.knownDays
    ? `Luis confirma que el tour dura ${tour.knownDays} días — usa este número exacto, no lo cambies.`
    : 'Luis no especificó la duración exacta — estima un número de días típico para este tipo de tour.';

  const prompt = `Eres un experto en trekking y turismo de aventura en Sudamérica. Un guía turístico llamado Luis quiere agregar el siguiente tour a su sitio web. Dame información realista y precisa basada en lo que se conoce públicamente sobre este tour y ruta. Si no estás seguro de un dato exacto, da una estimación razonable típica para ese tipo de tour.

Tour: "${tour.name}"
País(es): ${tour.countries.join(', ')}${multiCountry ? ' — este tour CRUZA FRONTERAS entre estos países, la ruta y el itinerario deben reflejarlo (ej. cruces fronterizos, cambios de país entre etapas)' : ''}
Ruta (inicio → fin): ${tour.route || '(no especificada — infiere una ruta típica entre las zonas más conocidas de estos países)'}
${daysHint}
Notas adicionales de Luis: ${tour.notes || '(ninguna)'}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{
  "description": "2-3 párrafos en español describiendo el tour, qué lo hace especial, paisajes y experiencia${multiCountry ? ', mencionando el cruce entre países' : ''}",
  "days": "número de días y noches, ej '5 días / 4 noches'",
  "distanceKm": "distancia total aproximada, ej '60 km'",
  "elevationGainM": "ganancia de elevación total aproximada, ej '2400 m'",
  "maxAltitudeM": "altitud máxima aproximada, ej '5160 m'",
  "difficulty": "Principiante, Intermedio, Intermedio-Avanzado o Avanzado",
  "bestSeason": "mejor época del año, ej 'Mayo a Septiembre'",
  "highlights": ["punto destacado 1", "punto destacado 2", "punto destacado 3", "punto destacado 4"],
  "itinerary": [
    {"day": 1, "title": "título corto del día", "detail": "1-2 frases describiendo el día, incluyendo el país si el tour es multi-país"},
    {"day": 2, "title": "...", "detail": "..."}
  ]
}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error: ${errText}`);
  }

  const data = await response.json<any>();
  const raw: string = data.choices?.[0]?.message?.content || '{}';
  const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

export async function handleSubmitTour(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData();
    const submission: TourSubmission = {
      name: (formData.get('name') as string) || '',
      countries: formData.getAll('countries').map((c) => c as string).filter(Boolean),
      price: (formData.get('price') as string) || '',
      route: (formData.get('route') as string) || '',
      knownDays: (formData.get('knownDays') as string) || '',
      notes: (formData.get('notes') as string) || '',
    };

    if (!submission.name || submission.countries.length === 0 || !submission.price) {
      return json({ success: false, message: 'Falta el nombre, al menos un país, o el precio del tour' }, 400);
    }

    const slug = slugify(`${submission.name}-${submission.countries.join('-')}`);

    const photoFiles = formData.getAll('photos').filter((p): p is File => p instanceof File && p.size > 0);
    const photos: string[] = [];
    for (const file of photoFiles.slice(0, 8)) {
      if (file.size > MAX_PHOTO_BYTES) continue;
      photos.push(await fileToDataUrl(file));
    }

    let enrichment: Partial<EnrichedTour> = {};
    let aiGenerated = false;
    try {
      enrichment = await enrichTourWithAI(submission, env);
      aiGenerated = true;
    } catch (e) {
      console.error('AI enrichment failed, saving basic info only:', e);
    }

    const tour: EnrichedTour = {
      ...submission,
      slug,
      description: enrichment.description || 'Descripción pendiente - Luis la completará pronto.',
      days: enrichment.days || 'Por confirmar',
      distanceKm: enrichment.distanceKm || 'Por confirmar',
      elevationGainM: enrichment.elevationGainM || 'Por confirmar',
      maxAltitudeM: enrichment.maxAltitudeM || 'Por confirmar',
      difficulty: enrichment.difficulty || 'Por confirmar',
      bestSeason: enrichment.bestSeason || 'Por confirmar',
      highlights: enrichment.highlights || [],
      itinerary: enrichment.itinerary || [],
      photos,
      createdAt: new Date().toISOString(),
      aiGenerated,
    };

    await env.SITE_DATA.put(`tour:${slug}`, JSON.stringify(tour));

    // Maintain an index of slugs for listing
    const indexRaw = await env.SITE_DATA.get('tours:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    if (!index.includes(slug)) {
      index.push(slug);
      await env.SITE_DATA.put('tours:index', JSON.stringify(index));
    }

    await notifyAdmin(
      env,
      `Quechua Aventuras — Luis agregó un tour: ${tour.name}`,
      `<h2>Nuevo tour agregado</h2>
       <p><strong>Nombre:</strong> ${escapeHtmlServer(tour.name)}</p>
       <p><strong>País(es):</strong> ${escapeHtmlServer(tour.countries.join(', '))}</p>
       <p><strong>Precio:</strong> $${escapeHtmlServer(tour.price)}</p>
       <p><strong>Fotos incluidas:</strong> ${photos.length}</p>`
    );

    return json({ success: true, tour });
  } catch (e) {
    console.error('submit-tour error', e);
    return json({ success: false, message: 'Error al guardar el tour' }, 500);
  }
}

export async function handleGetTours(_request: Request, env: Env): Promise<Response> {
  try {
    const indexRaw = await env.SITE_DATA.get('tours:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const tours: EnrichedTour[] = [];
    for (const slug of index) {
      const raw = await env.SITE_DATA.get(`tour:${slug}`);
      if (raw) tours.push(JSON.parse(raw));
    }
    tours.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return json({ success: true, tours });
  } catch (e) {
    console.error('get-tours error', e);
    return json({ success: false, message: 'Error al cargar tours' }, 500);
  }
}

// ---------- Photo uploads (Luis's photos + tour photos) ----------

const MAX_PHOTO_BYTES = 6 * 1024 * 1024; // 6MB per photo

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return `data:${file.type || 'image/jpeg'};base64,${base64}`;
}

export async function handleUploadPhoto(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData();
    const page = (formData.get('page') as string) || '';
    const caption = (formData.get('caption') as string) || '';
    const file = formData.get('file') as File | null;

    if (!page || !file) {
      return json({ success: false, message: 'Falta la página o el archivo' }, 400);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return json({ success: false, message: 'La foto es demasiado grande (máx. 6MB)' }, 400);
    }

    const id = genId();
    const dataUrl = await fileToDataUrl(file);
    const photo = {
      id,
      page,
      caption,
      filename: file.name,
      dataUrl,
      uploadedAt: new Date().toISOString(),
    };

    await env.SITE_DATA.put(`photo:${page}:${id}`, JSON.stringify(photo));

    const indexKey = `photos:${page}:index`;
    const indexRaw = await env.SITE_DATA.get(indexKey);
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    index.push(id);
    await env.SITE_DATA.put(indexKey, JSON.stringify(index));

    await notifyAdmin(
      env,
      `Quechua Aventuras — Luis subió una foto (${page})`,
      `<h2>Nueva foto subida</h2>
       <p><strong>Página:</strong> ${escapeHtmlServer(page)}</p>
       <p><strong>Archivo:</strong> ${escapeHtmlServer(file.name)}</p>
       ${caption ? `<p><strong>Descripción:</strong> ${escapeHtmlServer(caption)}</p>` : ''}`
    );

    return json({ success: true, photo });
  } catch (e) {
    console.error('upload-photo error', e);
    return json({ success: false, message: 'Error al subir la foto' }, 500);
  }
}

export async function handleGetPhotos(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const page = url.searchParams.get('page');
    if (!page) return json({ success: false, message: 'Falta la página' }, 400);

    const indexRaw = await env.SITE_DATA.get(`photos:${page}:index`);
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const photos = [];
    for (const id of index) {
      const raw = await env.SITE_DATA.get(`photo:${page}:${id}`);
      if (raw) photos.push(JSON.parse(raw));
    }
    photos.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
    return json({ success: true, photos });
  } catch (e) {
    console.error('get-photos error', e);
    return json({ success: false, message: 'Error al cargar fotos' }, 500);
  }
}

export async function handleDeletePhoto(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ page: string; id: string }>();
    if (!body.page || !body.id) return json({ success: false, message: 'Faltan datos' }, 400);

    await env.SITE_DATA.delete(`photo:${body.page}:${body.id}`);
    const indexKey = `photos:${body.page}:index`;
    const indexRaw = await env.SITE_DATA.get(indexKey);
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    await env.SITE_DATA.put(indexKey, JSON.stringify(index.filter((i) => i !== body.id)));

    return json({ success: true });
  } catch (e) {
    console.error('delete-photo error', e);
    return json({ success: false, message: 'Error al eliminar la foto' }, 500);
  }
}

// ---------- Voice notes (Luis speaks his feedback, Workers AI transcribes it) ----------

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15MB

export async function handleTranscribeVoiceNote(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData();
    const audio = formData.get('audio') as File | null;
    if (!audio) return json({ success: false, message: 'Falta el audio' }, 400);
    if (audio.size > MAX_AUDIO_BYTES) {
      return json({ success: false, message: 'La nota de voz es demasiado larga (máx. 15MB)' }, 400);
    }

    const buf = await audio.arrayBuffer();
    const result = await env.AI.run('@cf/openai/whisper', { audio: [...new Uint8Array(buf)] });
    const transcript = (result && (result.text || result.result?.text) || '').trim();

    if (!transcript) {
      return json({ success: false, message: 'No se pudo transcribir el audio. Intenta grabar de nuevo.' }, 500);
    }

    return json({ success: true, transcript });
  } catch (e) {
    console.error('transcribe-voice-note error', e);
    return json({ success: false, message: 'Error al transcribir la nota de voz' }, 500);
  }
}

interface SuggestedChange {
  page: string;
  change: string;
}

const SITE_PAGES_CONTEXT = 'Inicio, Nosotros (biografía de Luis), Filosofía (valores y FAQ), Tours (catálogo y tours individuales), Contacto, y Diseño general (colores, tipografía, layout). No incluyas el Panel de Control como página — es solo para Luis, no lo ven los clientes.';

async function generateSuggestedChanges(transcript: string, env: Env): Promise<SuggestedChange[]> {
  const prompt = `Eres un asistente que ayuda a convertir el feedback hablado de Luis (dueño de un negocio de tours de aventura en Sudamérica) en una lista de cambios concretos y accionables para su sitio web.

Páginas del sitio: ${SITE_PAGES_CONTEXT}

Nota de voz de Luis (ya transcrita):
"${transcript}"

Responde ÚNICAMENTE con un array JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
[{"page": "nombre de la página afectada, de la lista de arriba", "change": "descripción clara y específica de qué cambiar y por qué, en español"}]

Si el feedback menciona varias cosas, sepáralas en varios objetos. Si es vago, interpreta la intención de la forma más razonable posible. Si no contiene ningún cambio accionable (ej. solo un saludo), responde con un array vacío [].`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${await response.text()}`);

  const data = await response.json<any>();
  const raw: string = data.choices?.[0]?.message?.content || '[]';
  const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed : [];
}

function suggestedChangesHtml(changes: SuggestedChange[]): string {
  if (!changes.length) return '<p style="color:#6B5F52;">No se identificaron cambios específicos en esta nota.</p>';
  return `<ul style="padding-left:20px;">${changes
    .map((c) => `<li style="margin-bottom:6px;"><strong>${escapeHtmlServer(c.page)}:</strong> ${escapeHtmlServer(c.change)}</li>`)
    .join('')}</ul>`;
}

const WORKER_ORIGIN = 'https://quechua-aventuras.dstevo191.workers.dev';

function brandedHtmlPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#FBF6EC;color:#241C15;margin:0;padding:2rem 1.25rem;}
      .box{max-width:520px;margin:2rem auto;background:white;border-radius:14px;padding:2rem;box-shadow:0 12px 32px rgba(36,28,21,0.12);}
      h1{font-size:1.4rem;color:#1F3D33;margin-top:0;}
      textarea{width:100%;min-height:120px;padding:0.8rem;border:1px solid rgba(36,28,21,0.15);border-radius:8px;font-family:inherit;font-size:1rem;box-sizing:border-box;}
      button{margin-top:1rem;padding:0.8rem 1.6rem;background:#B5502C;color:white;border:none;border-radius:100px;font-weight:700;font-size:1rem;cursor:pointer;}
      a.back{display:inline-block;margin-top:1.5rem;color:#B5502C;}
    </style>
    </head><body><div class="box">${bodyHtml}</div></body></html>`;
}

async function setVoiceNoteStatus(env: Env, id: string, status: string, revisionNote?: string): Promise<any | null> {
  const raw = await env.SITE_DATA.get(`voicenote:${id}`);
  if (!raw) return null;
  const note = JSON.parse(raw);
  note.status = status;
  if (revisionNote !== undefined) note.revisionNote = revisionNote;
  note.statusUpdatedAt = new Date().toISOString();
  await env.SITE_DATA.put(`voicenote:${id}`, JSON.stringify(note));
  return note;
}

export async function handleSaveVoiceNote(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ transcript: string; audioDataUrl?: string }>();
    if (!body.transcript || !body.transcript.trim()) {
      return json({ success: false, message: 'Falta el texto de la nota' }, 400);
    }

    let suggestedChanges: SuggestedChange[] = [];
    try {
      suggestedChanges = await generateSuggestedChanges(body.transcript.trim(), env);
    } catch (e) {
      console.error('generate-suggested-changes failed', e);
    }

    const note = {
      id: genId(),
      transcript: body.transcript.trim(),
      audioDataUrl: body.audioDataUrl || null,
      suggestedChanges,
      status: 'pending', // pending | approved | needs-revision
      revisionNote: null as string | null,
      createdAt: new Date().toISOString(),
    };

    await env.SITE_DATA.put(`voicenote:${note.id}`, JSON.stringify(note));
    const indexRaw = await env.SITE_DATA.get('voicenotes:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    index.push(note.id);
    await env.SITE_DATA.put('voicenotes:index', JSON.stringify(index));

    const approveUrl = `${WORKER_ORIGIN}/api/voice-note-approve?id=${note.id}`;
    const reviseUrl = `${WORKER_ORIGIN}/api/voice-note-revise-page?id=${note.id}`;

    await notifyAdmin(
      env,
      `Quechua Aventuras — Luis dejó una nota de voz`,
      `<h2>Nueva nota de voz (transcrita)</h2>
       <blockquote style="border-left:3px solid #D9A544;padding-left:12px;color:#241C15;">${escapeHtmlServer(note.transcript)}</blockquote>
       <h3>Cambios sugeridos</h3>
       ${suggestedChangesHtml(suggestedChanges)}
       <p>
         <a href="${approveUrl}" style="display:inline-block;background:#1F3D33;color:white;padding:10px 20px;border-radius:100px;text-decoration:none;font-weight:bold;margin-right:10px;">✅ Aprobar cambios</a>
         <a href="${reviseUrl}" style="display:inline-block;background:#F4EBDA;color:#1F3D33;padding:10px 20px;border-radius:100px;text-decoration:none;font-weight:bold;">✏️ Pedir ajuste</a>
       </p>
       <p style="font-size:12px;color:#666;">Aprobar marca esto como listo para que Claude lo implemente en la próxima sesión de trabajo en el sitio — no se publica nada automáticamente en este instante.</p>`
    );

    return json({ success: true, note });
  } catch (e) {
    console.error('save-voice-note error', e);
    return json({ success: false, message: 'Error al guardar la nota de voz' }, 500);
  }
}

export async function handleGetVoiceNotes(_request: Request, env: Env): Promise<Response> {
  try {
    const indexRaw = await env.SITE_DATA.get('voicenotes:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const notes = [];
    for (const id of index) {
      const raw = await env.SITE_DATA.get(`voicenote:${id}`);
      if (raw) notes.push(JSON.parse(raw));
    }
    notes.sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    return json({ success: true, notes });
  } catch (e) {
    console.error('get-voice-notes error', e);
    return json({ success: false, message: 'Error al cargar las notas de voz' }, 500);
  }
}

export async function handleDeleteVoiceNote(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ id: string }>();
    if (!body.id) return json({ success: false, message: 'Falta el id' }, 400);

    await env.SITE_DATA.delete(`voicenote:${body.id}`);
    const indexRaw = await env.SITE_DATA.get('voicenotes:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    await env.SITE_DATA.put('voicenotes:index', JSON.stringify(index.filter((i) => i !== body.id)));

    return json({ success: true });
  } catch (e) {
    console.error('delete-voice-note error', e);
    return json({ success: false, message: 'Error al eliminar la nota de voz' }, 500);
  }
}

// JSON endpoint used by the Panel's own approve/revise buttons
export async function handleSetVoiceNoteStatus(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ id: string; status: string; revisionNote?: string }>();
    if (!body.id || !body.status) return json({ success: false, message: 'Faltan datos' }, 400);

    const note = await setVoiceNoteStatus(env, body.id, body.status, body.revisionNote);
    if (!note) return json({ success: false, message: 'Nota no encontrada' }, 404);

    if (body.status === 'needs-revision' && body.revisionNote) {
      await notifyAdmin(
        env,
        `Quechua Aventuras — Luis pidió un ajuste en su nota de voz`,
        `<h2>Ajuste pedido</h2>
         <blockquote style="border-left:3px solid #D9A544;padding-left:12px;">${escapeHtmlServer(note.transcript)}</blockquote>
         <p><strong>Lo que pidió ajustar:</strong> ${escapeHtmlServer(body.revisionNote)}</p>`
      );
    }

    return json({ success: true, note });
  } catch (e) {
    console.error('set-voice-note-status error', e);
    return json({ success: false, message: 'Error al actualizar el estado' }, 500);
  }
}

// Email-link handlers — these render HTML directly since they're opened
// by clicking a link inside the notification email, not called via fetch.
export async function handleVoiceNoteApprovePage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const note = await setVoiceNoteStatus(env, id, 'approved');

  const bodyHtml = note
    ? `<h1>✅ Cambios aprobados</h1><p>Quedó marcado como listo. Se implementará en la próxima sesión de trabajo en el sitio.</p><blockquote style="border-left:3px solid #D9A544;padding-left:12px;color:#6B5F52;">${escapeHtmlServer(note.transcript)}</blockquote>`
    : `<h1>No encontramos esa nota</h1><p>Puede que ya haya sido eliminada.</p>`;

  return new Response(brandedHtmlPage('Cambios aprobados', bodyHtml), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function handleVoiceNoteRevisePage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const raw = await env.SITE_DATA.get(`voicenote:${id}`);
  const note = raw ? JSON.parse(raw) : null;

  const bodyHtml = note
    ? `<h1>✏️ Pedir un ajuste</h1>
       <p>Cuéntanos qué deberíamos entender distinto de esta nota:</p>
       <blockquote style="border-left:3px solid #D9A544;padding-left:12px;color:#6B5F52;">${escapeHtmlServer(note.transcript)}</blockquote>
       <form method="POST" action="${WORKER_ORIGIN}/api/voice-note-revise">
         <input type="hidden" name="id" value="${id}" />
         <textarea name="revisionNote" placeholder="Ej: en realidad me refería a la página de Tours, no a Inicio..." required></textarea>
         <br/>
         <button type="submit">Enviar ajuste</button>
       </form>`
    : `<h1>No encontramos esa nota</h1><p>Puede que ya haya sido eliminada.</p>`;

  return new Response(brandedHtmlPage('Pedir un ajuste', bodyHtml), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function handleVoiceNoteReviseSubmit(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const id = (formData.get('id') as string) || '';
  const revisionNote = (formData.get('revisionNote') as string) || '';

  const note = await setVoiceNoteStatus(env, id, 'needs-revision', revisionNote);

  if (note && revisionNote) {
    await notifyAdmin(
      env,
      `Quechua Aventuras — Luis pidió un ajuste en su nota de voz`,
      `<h2>Ajuste pedido</h2>
       <blockquote style="border-left:3px solid #D9A544;padding-left:12px;">${escapeHtmlServer(note.transcript)}</blockquote>
       <p><strong>Lo que pidió ajustar:</strong> ${escapeHtmlServer(revisionNote)}</p>`
    );
  }

  const bodyHtml = note
    ? `<h1>Gracias</h1><p>Guardamos tu ajuste y avisamos para que se tenga en cuenta antes de implementar los cambios.</p>`
    : `<h1>No encontramos esa nota</h1><p>Puede que ya haya sido eliminada.</p>`;

  return new Response(brandedHtmlPage('Ajuste enviado', bodyHtml), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ---------- Testimonials ----------

interface Testimonial {
  id: string;
  authorName: string;
  authorOrigin?: string;
  tourName?: string;
  text: string;
  createdAt: string;
}

export async function handleSubmitTestimonial(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ authorName: string; authorOrigin?: string; tourName?: string; text: string }>();
    if (!body.authorName || !body.text) {
      return json({ success: false, message: 'Falta el nombre o el texto del testimonio' }, 400);
    }

    const testimonial: Testimonial = {
      id: genId(),
      authorName: body.authorName,
      authorOrigin: body.authorOrigin || '',
      tourName: body.tourName || '',
      text: body.text,
      createdAt: new Date().toISOString(),
    };

    await env.SITE_DATA.put(`testimonial:${testimonial.id}`, JSON.stringify(testimonial));

    const indexRaw = await env.SITE_DATA.get('testimonials:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    index.push(testimonial.id);
    await env.SITE_DATA.put('testimonials:index', JSON.stringify(index));

    await notifyAdmin(
      env,
      `Quechua Aventuras — Luis agregó un testimonio de ${testimonial.authorName}`,
      `<h2>Nuevo testimonio</h2>
       <p><strong>Cliente:</strong> ${escapeHtmlServer(testimonial.authorName)}</p>
       ${testimonial.authorOrigin ? `<p><strong>Origen:</strong> ${escapeHtmlServer(testimonial.authorOrigin)}</p>` : ''}
       ${testimonial.tourName ? `<p><strong>Tour:</strong> ${escapeHtmlServer(testimonial.tourName)}</p>` : ''}
       <blockquote style="border-left:3px solid #D9A544;padding-left:12px;color:#241C15;">${escapeHtmlServer(testimonial.text)}</blockquote>`
    );

    return json({ success: true, testimonial });
  } catch (e) {
    console.error('submit-testimonial error', e);
    return json({ success: false, message: 'Error al guardar el testimonio' }, 500);
  }
}

export async function handleGetTestimonials(_request: Request, env: Env): Promise<Response> {
  try {
    const indexRaw = await env.SITE_DATA.get('testimonials:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const testimonials: Testimonial[] = [];
    for (const id of index) {
      const raw = await env.SITE_DATA.get(`testimonial:${id}`);
      if (raw) testimonials.push(JSON.parse(raw));
    }
    testimonials.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return json({ success: true, testimonials });
  } catch (e) {
    console.error('get-testimonials error', e);
    return json({ success: false, message: 'Error al cargar testimonios' }, 500);
  }
}

export async function handleDeleteTestimonial(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ id: string }>();
    if (!body.id) return json({ success: false, message: 'Falta el id' }, 400);

    await env.SITE_DATA.delete(`testimonial:${body.id}`);
    const indexRaw = await env.SITE_DATA.get('testimonials:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    await env.SITE_DATA.put('testimonials:index', JSON.stringify(index.filter((i) => i !== body.id)));

    return json({ success: true });
  } catch (e) {
    console.error('delete-testimonial error', e);
    return json({ success: false, message: 'Error al eliminar el testimonio' }, 500);
  }
}

export async function handleDeleteTour(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ slug: string }>();
    if (!body.slug) return json({ success: false, message: 'Falta el slug' }, 400);

    await env.SITE_DATA.delete(`tour:${body.slug}`);
    const indexRaw = await env.SITE_DATA.get('tours:index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const updated = index.filter((s) => s !== body.slug);
    await env.SITE_DATA.put('tours:index', JSON.stringify(updated));

    return json({ success: true });
  } catch (e) {
    console.error('delete-tour error', e);
    return json({ success: false, message: 'Error al eliminar' }, 500);
  }
}

// ---------- Site settings (publish / draft toggle) ----------

export async function handleGetSiteSettings(_request: Request, env: Env): Promise<Response> {
  try {
    const raw = await env.SITE_DATA.get('site-settings');
    const settings = raw ? JSON.parse(raw) : { published: false };
    return json({ success: true, settings });
  } catch (e) {
    console.error('get-site-settings error', e);
    return json({ success: false, message: 'Error al cargar la configuración' }, 500);
  }
}

export async function handleSaveSiteSettings(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ published: boolean }>();
    const settings = { published: !!body.published, updatedAt: new Date().toISOString() };
    await env.SITE_DATA.put('site-settings', JSON.stringify(settings));
    return json({ success: true, settings });
  } catch (e) {
    console.error('save-site-settings error', e);
    return json({ success: false, message: 'Error al guardar la configuración' }, 500);
  }
}
