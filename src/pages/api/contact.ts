import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await request.formData();
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      tour: formData.get('tour'),
      message: formData.get('message'),
      timestamp: new Date().toISOString(),
    };

    // Validate required fields
    if (!data.name || !data.email || !data.tour) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Por favor completa todos los campos requeridos',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log the inquiry
    console.log('Contact Inquiry:', data);

    // TODO: Send email to Luis via your email service
    // This will be integrated with your Cloudflare Worker
    // For now, the Worker will handle the email delivery

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tu mensaje ha sido enviado a Luis. Él se contactará contigo pronto.',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Contact form error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error al enviar el mensaje. Por favor intenta de nuevo.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
