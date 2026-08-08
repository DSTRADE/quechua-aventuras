// Cloudflare Worker - Contact Form Handler
// This handles both setup and customer inquiries with email via Resend

interface ContactConfig {
  luisEmail: string;
  luisWhatsapp?: string;
  luisPhone?: string;
  luisLocation?: string;
  formDestination: 'email' | 'whatsapp' | 'both';
  receivingEmail: string;
  timestamp: string;
}

interface ContactInquiry {
  name: string;
  email: string;
  phone?: string;
  tour: string;
  message: string;
  timestamp: string;
}

// Send email via Resend
async function sendEmail(
  env: any,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'noreply@quechua-aventuras.com',
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }
}

export async function handleSetupContact(request: Request, env: any): Promise<Response> {
  try {
    const formData = await request.formData();
    const config: ContactConfig = {
      luisEmail: formData.get('luisEmail') as string,
      luisWhatsapp: (formData.get('luisWhatsapp') as string) || undefined,
      luisPhone: (formData.get('luisPhone') as string) || undefined,
      luisLocation: (formData.get('luisLocation') as string) || undefined,
      formDestination: (formData.get('formDestination') as 'email' | 'whatsapp' | 'both') || 'email',
      receivingEmail: (formData.get('receivingEmail') as string) || (formData.get('luisEmail') as string),
      timestamp: new Date().toISOString(),
    };

    // Validate required fields
    if (!config.luisEmail || !config.formDestination) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Por favor completa los campos requeridos',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Save to KV storage
    await env.CONTACT_CONFIG.put('luis-config', JSON.stringify(config), {
      expirationTtl: 31536000,
    });

    // Send confirmation email to Luis
    const confirmationHtml = `
      <h2>Configuración de Contacto Guardada</h2>
      <p>Hola Luis,</p>
      <p>Tu información de contacto ha sido guardada exitosamente en tu sitio web.</p>
      <h3>Detalles:</h3>
      <ul>
        <li><strong>Email:</strong> ${config.luisEmail}</li>
        <li><strong>WhatsApp:</strong> ${config.luisWhatsapp || 'No configurado'}</li>
        <li><strong>Teléfono:</strong> ${config.luisPhone || 'No configurado'}</li>
        <li><strong>Ubicación:</strong> ${config.luisLocation || 'No especificada'}</li>
        <li><strong>Método de Recepción:</strong> ${config.formDestination === 'email' ? 'Email' : config.formDestination === 'whatsapp' ? 'WhatsApp' : 'Email y WhatsApp'}</li>
        <li><strong>Email Receptor:</strong> ${config.receivingEmail}</li>
      </ul>
      <p>A partir de ahora, los clientes potenciales que completen el formulario de contacto serán entregados a través del método que elegiste.</p>
    `;

    try {
      await sendEmail(env, config.luisEmail, 'Configuración de Contacto - Quechua Aventuras', confirmationHtml);
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Configuración guardada. Tu información de contacto ha sido actualizada.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
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
}

export async function handleCustomerContact(request: Request, env: any): Promise<Response> {
  try {
    const formData = await request.formData();
    const inquiry: ContactInquiry = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: (formData.get('phone') as string) || undefined,
      tour: formData.get('tour') as string,
      message: formData.get('message') as string,
      timestamp: new Date().toISOString(),
    };

    // Validate required fields
    if (!inquiry.name || !inquiry.email || !inquiry.tour) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Por favor completa todos los campos requeridos',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get Luis's config from KV
    const configStr = await env.CONTACT_CONFIG.get('luis-config');
    const config: ContactConfig | null = configStr ? JSON.parse(configStr) : null;

    if (!config) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Luis has not configured his contact settings yet. Please try again later.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send email to Luis with inquiry details
    const inquiryHtml = `
      <h2>Nueva Consulta de Tour</h2>
      <p><strong>De:</strong> ${inquiry.name}</p>
      <p><strong>Email:</strong> ${inquiry.email}</p>
      ${inquiry.phone ? `<p><strong>Teléfono:</strong> ${inquiry.phone}</p>` : ''}
      <p><strong>Tour Interesado:</strong> ${inquiry.tour}</p>
      <h3>Mensaje:</h3>
      <p>${inquiry.message.replace(/\n/g, '<br>')}</p>
      <hr>
      <p style="font-size: 12px; color: #666;">
        Responde a ${inquiry.email} para contactar al cliente.
      </p>
    `;

    if (config.formDestination === 'email' || config.formDestination === 'both') {
      try {
        await sendEmail(env, config.receivingEmail, `Nueva Consulta de Tour - ${inquiry.tour}`, inquiryHtml);
      } catch (emailError) {
        console.error('Failed to send inquiry email to Luis:', emailError);
        throw emailError;
      }
    }

    // Send confirmation email to customer
    const confirmationHtml = `
      <h2>Recibimos tu Consulta</h2>
      <p>Hola ${inquiry.name},</p>
      <p>Gracias por tu interés en nuestros tours de Quechua Aventuras.</p>
      <p>Hemos recibido tu consulta sobre el tour <strong>${inquiry.tour}</strong> y Luis se pondrá en contacto contigo pronto.</p>
      <p>Mientras tanto, puedes revisar más detalles en nuestro sitio web.</p>
      <p>¡Gracias!</p>
      <p>Equipo de Quechua Aventuras</p>
    `;

    try {
      await sendEmail(env, inquiry.email, 'Recibimos tu Consulta - Quechua Aventuras', confirmationHtml);
    } catch (emailError) {
      console.error('Failed to send confirmation email to customer:', emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tu mensaje ha sido enviado a Luis. Él se contactará contigo pronto.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
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
}
