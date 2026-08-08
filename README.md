# Quechua Aventuras

Un sitio web para los tours de montaña de Luis en Perú. Construido con Astro para múltiples idiomas.

## Estructura del Proyecto

- **`/src/pages/es/`** - Páginas en español (idioma por defecto)
- **`/src/pages/en/`** - Páginas en inglés (estructura lista para contenido)
- **`/src/layouts/`** - Componentes de layout
- **`/src/styles/`** - Estilos globales

## Páginas Actuales

- Homepage
- Nosotros (Sobre Luis)
- Negocio y Filosofía
- Tours
  - Circuito Ausangate (detalle)
  - Siete Lagunas (detalle)
  - Salkantay Trek (detalle)
- Contacto

## Setup Inicial

```bash
npm install
npm run dev
```

El sitio estará disponible en `http://localhost:3000`

## Contenido por Completar (Luis)

### Información Personal
- [ ] Biografía completa
- [ ] Experiencia y certificaciones
- [ ] Fotos personales
- [ ] Misión y valores

### Tours
Para cada tour necesitamos:
- [ ] Descripción detallada
- [ ] Itinerario día por día
- [ ] Distancia y elevación exactas
- [ ] Tamaño máximo de grupo
- [ ] Precio
- [ ] Fotos de Luis en el tour
- [ ] Mejor época para visitar
- [ ] Requisitos específicos

### Información de Contacto
- [ ] Email
- [ ] WhatsApp
- [ ] Teléfono
- [ ] Ubicación en Cusco
- [ ] Horarios de atención

## Notas Importantes

### Fotos
Las fotos genéricas actualmente en el sitio serán reemplazadas por fotos reales de Luis
en sus expediciones. Se han dejado notas en cada página indicando dónde irán las fotos.

### Multiidioma
El sitio está preparado para agregar francés (fr), inglés (en) y polaco (pl) en el futuro.
La estructura está lista - solo necesitamos duplicar el contenido en otros idiomas cuando esté listo.

### Formulario de Contacto
El formulario enviará mensajes directamente a Luis via email.

## Implementación de Idiomas

Para agregar un nuevo idioma:

1. Copia la carpeta `/src/pages/es/` a `/src/pages/[idioma-code]/`
2. Traduce el contenido
3. Actualiza los links de navegación en `/src/layouts/Base.astro`

## Deploy

```bash
npm run build
```

El sitio estará listo en `/dist/`

## Contacto

Luis: [información de contacto a completar]
