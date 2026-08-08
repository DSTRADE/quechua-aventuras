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

// ---------- Branded admin email template (Alpenglow palette: clay/forest/gold/cream) ----------

const BRAND = {
  clay: '#B5502C',
  clayDark: '#8F3D21',
  forest: '#1F3D33',
  forestDark: '#142822',
  gold: '#D9A544',
  goldLight: '#F0D9A8',
  cream: '#FBF6EC',
  cream2: '#F4EBDA',
  ink: '#241C15',
  stone: '#6B5F52',
};

const PAGE_LABELS: Record<string, string> = {
  sitio: 'Home',
  nosotros: 'About',
  negocio: 'Philosophy',
  tours: 'Tours',
  contacto: 'Contact',
  feedback: 'Control Panel',
  'home-luis': "Home — Luis's photos",
  'home-favorites': 'Home — Favorite photos',
};

function pageLabel(key: string): string {
  return PAGE_LABELS[key] || key;
}

function emailQuote(text: string): string {
  return `<blockquote style="margin:0 0 18px;padding:14px 16px;background:${BRAND.cream2};border-left:3px solid ${BRAND.gold};border-radius:8px;color:${BRAND.ink};font-style:italic;line-height:1.6;">${escapeHtmlServer(text).replace(/\n/g, '<br>')}</blockquote>`;
}

function emailBadge(text: string): string {
  return `<span style="display:inline-block;background:${BRAND.cream2};color:${BRAND.forest};font-size:12px;font-weight:700;letter-spacing:0.02em;padding:4px 12px;border-radius:100px;margin:0 6px 6px 0;">${escapeHtmlServer(text)}</span>`;
}

function emailField(label: string, value: string): string {
  return `<p style="margin:0 0 10px;font-size:14px;color:${BRAND.ink};"><strong style="color:${BRAND.forest};">${escapeHtmlServer(label)}:</strong> ${escapeHtmlServer(value)}</p>`;
}

function emailButton(label: string, url: string, variant: 'primary' | 'secondary' = 'primary'): string {
  const bg = variant === 'primary' ? BRAND.forest : BRAND.cream2;
  const color = variant === 'primary' ? '#ffffff' : BRAND.forest;
  return `<a href="${url}" style="display:inline-block;background:${bg};color:${color};padding:12px 22px;border-radius:100px;text-decoration:none;font-weight:700;font-size:14px;margin:4px 10px 4px 0;">${label}</a>`;
}

function emailShell(eyebrow: string, headline: string, bodyHtml: string): string {
  return `<div style="background:${BRAND.cream};padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;">
      <div style="background:${BRAND.forest};border-radius:16px 16px 0 0;padding:22px 28px;text-align:center;">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">⛰ Quechua Aventuras</span>
      </div>
      <div style="background:#ffffff;padding:30px 28px;border-radius:0 0 16px 16px;box-shadow:0 12px 32px rgba(36,28,21,0.1);">
        <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.clay};margin-bottom:8px;">${eyebrow}</span>
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:700;color:${BRAND.forest};margin:0 0 18px;line-height:1.25;">${headline}</h1>
        ${bodyHtml}
      </div>
      <p style="text-align:center;color:#A79A89;font-size:12px;margin:20px 0 0;">Control Panel notification — Quechua Aventuras</p>
    </div>
  </div>`;
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
        `Quechua Aventuras — Luis updated the ${pageLabel(body.page)} page`,
        emailShell(
          'Content update',
          `Luis wrote something new on the <strong>${escapeHtmlServer(pageLabel(body.page))}</strong> page`,
          `${emailBadge(body.field)}
           <div style="margin-top:14px;">${emailQuote(body.value.slice(0, 1000))}</div>`
        )
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
      `Quechua Aventuras — New tour added: ${tour.name}`,
      emailShell(
        'New tour',
        `Luis added a new tour: <strong>${escapeHtmlServer(tour.name)}</strong>`,
        `${tour.countries.map((c: string) => emailBadge(c)).join('')}
         <div style="margin-top:10px;">
           ${emailField('Price', `$${tour.price}`)}
           ${emailField('Photos included', String(photos.length))}
           ${aiGenerated ? emailField('Details', 'AI-suggested — worth a quick review') : ''}
         </div>`
      )
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
      `Quechua Aventuras — Luis uploaded a photo`,
      emailShell(
        'New photo',
        `Luis uploaded a photo to <strong>${escapeHtmlServer(pageLabel(page))}</strong>`,
        `${emailField('File', file.name)}
         ${caption ? emailQuote(caption) : ''}`
      )
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

const SITE_PAGES_CONTEXT = "Home, About (Luis's bio), Philosophy (values and FAQ), Tours (catalog and individual tours), Contact, and General design (colors, typography, layout). Do not include the Control Panel as a page — it's for Luis only, customers never see it.";

async function generateSuggestedChanges(transcript: string, env: Env): Promise<SuggestedChange[]> {
  // The transcript is in Spanish (Luis speaks Spanish) but the output is in
  // English, since that's what the developer reading the notification reads.
  const prompt = `You help turn Luis's spoken feedback (owner of an adventure tour business in South America) into a list of concrete, actionable changes for his website. The transcript below is in Spanish — read it in Spanish, but write your output in English.

Site pages: ${SITE_PAGES_CONTEXT}

Luis's voice note (already transcribed, in Spanish):
"${transcript}"

Respond with ONLY a valid JSON array (no markdown, no extra text) in exactly this shape:
[{"page": "the affected page, from the list above", "change": "a clear, specific description in English of what to change and why"}]

If the feedback mentions multiple things, split them into separate objects. If it's vague, interpret the intent as reasonably as possible. If there's no actionable change (e.g. just a greeting), respond with an empty array [].`;

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
  if (!changes.length) {
    return `<p style="color:${BRAND.stone};font-size:14px;">No specific changes identified in this note.</p>`;
  }
  return `<div style="margin:0 0 20px;">
    ${changes
      .map(
        (c) => `<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid ${BRAND.cream2};">
          <span style="flex-shrink:0;">${emailBadge(c.page)}</span>
          <span style="font-size:14px;color:${BRAND.ink};line-height:1.5;">${escapeHtmlServer(c.change)}</span>
        </div>`
      )
      .join('')}
  </div>`;
}

const WORKER_ORIGIN = 'https://quechua-aventuras.dstevo191.workers.dev';

function brandedHtmlPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:${BRAND.cream};color:${BRAND.ink};margin:0;padding:0;}
      .topbar{background:${BRAND.forest};padding:22px 28px;text-align:center;}
      .topbar span{font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#ffffff;}
      .wrap{max-width:520px;margin:0 auto;padding:2rem 1.25rem;}
      .box{background:white;border-radius:16px;padding:2rem;box-shadow:0 12px 32px rgba(36,28,21,0.12);}
      h1{font-family:Georgia,'Times New Roman',serif;font-size:1.5rem;color:${BRAND.forest};margin-top:0;}
      blockquote{margin:0 0 18px;padding:14px 16px;background:${BRAND.cream2};border-left:3px solid ${BRAND.gold};border-radius:8px;color:${BRAND.ink};font-style:italic;line-height:1.6;}
      textarea{width:100%;min-height:120px;padding:0.8rem;border:1px solid rgba(36,28,21,0.15);border-radius:8px;font-family:inherit;font-size:1rem;}
      button{margin-top:1rem;padding:0.8rem 1.8rem;background:${BRAND.clay};color:white;border:none;border-radius:100px;font-weight:700;font-size:1rem;cursor:pointer;}
      button:hover{background:${BRAND.clayDark};}
    </style>
    </head><body>
      <div class="topbar"><span>⛰ Quechua Aventuras</span></div>
      <div class="wrap"><div class="box">${bodyHtml}</div></div>
    </body></html>`;
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
    const body = await request.json<{ transcript: string }>();
    if (!body.transcript || !body.transcript.trim()) {
      return json({ success: false, message: 'Falta el texto de la nota' }, 400);
    }

    let suggestedChanges: SuggestedChange[] = [];
    try {
      suggestedChanges = await generateSuggestedChanges(body.transcript.trim(), env);
    } catch (e) {
      console.error('generate-suggested-changes failed', e);
    }

    // Deliberately not keeping the audio itself — just a quick text record
    // (transcript + AI-suggested changes) for the notification email.
    const note = {
      id: genId(),
      transcript: body.transcript.trim(),
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
      `Quechua Aventuras — Luis left a voice note`,
      emailShell(
        'Voice note',
        `Luis left a voice note`,
        `<p style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.stone};margin:0 0 6px;">Transcript (Spanish)</p>
         ${emailQuote(note.transcript)}
         <p style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.stone};margin:0 0 6px;">Suggested changes</p>
         ${suggestedChangesHtml(suggestedChanges)}
         <div style="margin-top:6px;">
           ${emailButton('✅ Approve changes', approveUrl, 'primary')}
           ${emailButton('✏️ Request adjustment', reviseUrl, 'secondary')}
         </div>
         <p style="font-size:12px;color:${BRAND.stone};margin-top:18px;">Approving marks this as ready for Claude to implement in the next site session — nothing publishes automatically right now.</p>`
      )
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
        `Quechua Aventuras — Adjustment requested on a voice note`,
        emailShell(
          'Adjustment requested',
          `An adjustment was requested on this voice note`,
          `${emailQuote(note.transcript)}
           ${emailField('Requested adjustment', body.revisionNote)}`
        )
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
    ? `<h1>✅ Changes approved</h1><p>Marked as ready. It'll be implemented in the next site work session.</p>${emailQuote(note.transcript)}`
    : `<h1>Note not found</h1><p>It may have already been deleted.</p>`;

  return new Response(brandedHtmlPage('Changes approved', bodyHtml), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function handleVoiceNoteRevisePage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const raw = await env.SITE_DATA.get(`voicenote:${id}`);
  const note = raw ? JSON.parse(raw) : null;

  const bodyHtml = note
    ? `<h1>✏️ Request an adjustment</h1>
       <p>Tell us what should be interpreted differently on this note:</p>
       ${emailQuote(note.transcript)}
       <form method="POST" action="${WORKER_ORIGIN}/api/voice-note-revise">
         <input type="hidden" name="id" value="${id}" />
         <textarea name="revisionNote" placeholder="E.g. that was actually about the Tours page, not Home..." required></textarea>
         <br/>
         <button type="submit">Send adjustment</button>
       </form>`
    : `<h1>Note not found</h1><p>It may have already been deleted.</p>`;

  return new Response(brandedHtmlPage('Request an adjustment', bodyHtml), {
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
      `Quechua Aventuras — Adjustment requested on a voice note`,
      emailShell(
        'Adjustment requested',
        `An adjustment was requested on this voice note`,
        `${emailQuote(note.transcript)}
         ${emailField('Requested adjustment', revisionNote)}`
      )
    );
  }

  const bodyHtml = note
    ? `<h1>Thanks</h1><p>Saved your adjustment — it'll be factored in before the changes are implemented.</p>`
    : `<h1>Note not found</h1><p>It may have already been deleted.</p>`;

  return new Response(brandedHtmlPage('Adjustment sent', bodyHtml), {
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
      `Quechua Aventuras — New testimonial from ${testimonial.authorName}`,
      emailShell(
        'New testimonial',
        `Luis added a testimonial from <strong>${escapeHtmlServer(testimonial.authorName)}</strong>`,
        `${testimonial.authorOrigin ? emailBadge(testimonial.authorOrigin) : ''}${testimonial.tourName ? emailBadge(testimonial.tourName) : ''}
         <div style="margin-top:10px;">${emailQuote(testimonial.text)}</div>`
      )
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
