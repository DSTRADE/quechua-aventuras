import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await request.formData();
    const data = {
      luisEmail: formData.get('luisEmail'),
      luisWhatsapp: formData.get('luisWhatsapp'),
      luisPhone: formData.get('luisPhone'),
      luisLocation: formData.get('luisLocation'),
      formDestination: formData.get('formDestination'),
      receivingEmail: formData.get('receivingEmail'),
      timestamp: new Date().toISOString(),
    };

    // Log the setup (in production, this would save to a database)
    console.log('Setup Contact Info:', data);

    // Store in environment or send notification
    // For now, we'll return success
    // In production, integrate with your Worker to store this

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Configuración guardada. Tu información de contacto ha sido actualizada.',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Setup contact error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error al guardar la configuración',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
