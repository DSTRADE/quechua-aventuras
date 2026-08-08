// Handles: editable page content (save/get) and AI-assisted tour submissions

export interface Env {
  SITE_DATA: KVNamespace;
  OPENROUTER_API_KEY: string;
}

// ---------- Editable content boxes (nosotros, negocio, etc.) ----------

export async function handleSaveContent(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ page: string; field: string; value: string }>();
    if (!body.page || !body.field) {
      return json({ success: false, message: 'Faltan datos' }, 400);
    }
    await env.SITE_DATA.put(`content:${body.page}:${body.field}`, body.value || '');
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
