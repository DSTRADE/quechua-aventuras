# Cloudflare Worker Integration Guide

This site has two contact form APIs that need to be handled by your Cloudflare Worker:

## API Endpoints

### 1. Setup Contact Form
**Endpoint:** `POST /api/setup-contact`

**Purpose:** Luis configures where he wants to receive customer inquiries

**Form Data:**
```
- luisEmail: Luis's primary email
- luisWhatsapp: Luis's WhatsApp number (optional)
- luisPhone: Luis's phone number (optional)
- luisLocation: Luis's location in Cusco (optional)
- formDestination: 'email' | 'whatsapp' | 'both'
- receivingEmail: Email where he wants inquiries sent
- timestamp: Auto-generated
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Configuración guardada. Tu información de contacto ha sido actualizada."
}
```

### 2. Customer Contact Form
**Endpoint:** `POST /api/contact`

**Purpose:** Customers submit tour inquiries

**Form Data:**
```
- name: Customer name
- email: Customer email
- phone: Customer phone (optional)
- tour: Selected tour
- message: Inquiry message
- timestamp: Auto-generated
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Tu mensaje ha sido enviado a Luis. Él se contactará contigo pronto."
}
```

## Integration Tasks

### 1. Store Luis's Configuration
When Luis submits the setup form, you need to:
- Store his contact info in Cloudflare Workers KV storage or a database
- Key format: `luis-contact-config`
- Include: email, whatsapp, phone, location, preferred delivery method

### 2. Handle Customer Inquiries
When a customer submits an inquiry:
1. Retrieve Luis's configuration from KV storage
2. Send email/WhatsApp based on his preferences:
   - **If 'email':** Send email to `receivingEmail` with customer details
   - **If 'whatsapp':** Send WhatsApp message to `luisWhatsapp`
   - **If 'both':** Send both
3. Email should include: name, email, phone, tour, message, timestamp
4. Optionally, send confirmation email to customer

### 3. Email Service Integration
You'll need to integrate an email service like:
- **SendGrid** (simple, reliable)
- **Resend** (modern, developer-friendly)
- **Mailgun** (enterprise option)

Add API keys to your Worker secrets:
```
SENDGRID_API_KEY=your_key_here
WHATSAPP_API_KEY=your_key_here  # If using WhatsApp API
```

### 4. KV Storage Setup
Create a KV namespace in Cloudflare (if not already done):
```
Bindings → KV Namespaces → Add binding
Name: CONTACT_CONFIG (or your preference)
```

## Example Worker Code Structure

```typescript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Setup contact form
    if (url.pathname === '/api/setup-contact' && request.method === 'POST') {
      const formData = await request.formData();
      const config = {
        luisEmail: formData.get('luisEmail'),
        luisWhatsapp: formData.get('luisWhatsapp'),
        luisPhone: formData.get('luisPhone'),
        luisLocation: formData.get('luisLocation'),
        formDestination: formData.get('formDestination'),
        receivingEmail: formData.get('receivingEmail'),
        timestamp: new Date().toISOString(),
      };

      // Save to KV
      await env.CONTACT_CONFIG.put('luis-config', JSON.stringify(config));

      return new Response(JSON.stringify({
        success: true,
        message: 'Configuración guardada',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Customer inquiry
    if (url.pathname === '/api/contact' && request.method === 'POST') {
      const formData = await request.formData();
      const inquiry = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        tour: formData.get('tour'),
        message: formData.get('message'),
        timestamp: new Date().toISOString(),
      };

      // Get Luis's config
      const configStr = await env.CONTACT_CONFIG.get('luis-config');
      const config = configStr ? JSON.parse(configStr) : null;

      if (!config) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Luis has not configured his contact settings yet',
        }), { status: 400 });
      }

      // Send via configured method
      if (config.formDestination === 'email' || config.formDestination === 'both') {
        await sendEmail(env, config.receivingEmail, inquiry);
      }

      if (config.formDestination === 'whatsapp' || config.formDestination === 'both') {
        await sendWhatsApp(env, config.luisWhatsapp, inquiry);
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Tu mensaje ha sido enviado a Luis',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function sendEmail(env, to, inquiry) {
  // Implement SendGrid/Resend/Mailgun email sending
}

async function sendWhatsApp(env, phone, inquiry) {
  // Implement WhatsApp API integration (Twilio, etc.)
}
```

## Next Steps

1. **Update your existing Worker** with the code above (adapted to your setup)
2. **Set up KV namespace** in Cloudflare Dashboard
3. **Add email service** integration (SendGrid recommended)
4. **Test** both forms on the contact page
5. **Luis can now configure** where he wants inquiries sent

Let me know if you need help with the Worker code!
