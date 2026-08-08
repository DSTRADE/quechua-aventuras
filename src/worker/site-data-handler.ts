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
  country: string;
  price: string;
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
  const prompt = `Eres un experto en trekking y turismo de aventura en Sudamérica. Un guía turístico llamado Luis quiere agregar el siguiente tour a su sitio web. Dame información realista y precisa basada en lo que se conoce públicamente sobre este tour. Si no estás seguro de un dato exacto, da una estimación razonable típica para ese tipo de tour.

Tour: "${tour.name}"
País: ${tour.country}
Notas adicionales de Luis: ${tour.notes || '(ninguna)'}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional) con esta forma exacta:
{
  "description": "2-3 párrafos en español describiendo el tour, qué lo hace especial, paisajes y experiencia",
  "days": "número de días y noches, ej '5 días / 4 noches'",
  "distanceKm": "distancia total aproximada, ej '60 km'",
  "elevationGainM": "ganancia de elevación total aproximada, ej '2400 m'",
  "maxAltitudeM": "altitud máxima aproximada, ej '5160 m'",
  "difficulty": "Principiante, Intermedio, Intermedio-Avanzado o Avanzado",
  "bestSeason": "mejor época del año, ej 'Mayo a Septiembre'",
  "highlights": ["punto destacado 1", "punto destacado 2", "punto destacado 3", "punto destacado 4"],
  "itinerary": [
    {"day": 1, "title": "título corto del día", "detail": "1-2 frases describiendo el día"},
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
      country: (formData.get('country') as string) || '',
      price: (formData.get('price') as string) || '',
      notes: (formData.get('notes') as string) || '',
    };

    if (!submission.name || !submission.country || !submission.price) {
      return json({ success: false, message: 'Falta el nombre, país o precio del tour' }, 400);
    }

    const slug = slugify(`${submission.name}-${submission.country}`);

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
