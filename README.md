# Accesibilidad Web Extension

Extension WebExtension (Manifest V3) para mejorar la legibilidad en sitios web con controles de:

- Escala de fuente
- Alto contraste
- Interlineado
- Espaciado de letras
- Tipografia amigable para dislexia
- Control por sitio (aplicar, siempre, nunca y restablecer dominio)
- Perfiles rapidos (baja vision, dislexia, adulto mayor, daltonismo)
- Regla de lectura y enfoque de parrafo
- Ocultar distracciones visuales
- Lectura en voz del texto seleccionado (TTS)
- Auditoria rapida de accesibilidad (imagenes sin alt, encabezados, contraste)
- Exportar e importar configuracion en JSON
- Resumen inteligente de la pagina (local)
- Simplificacion inteligente de texto por nivel (leve, media, alta)
- OCR de imagenes (OCR.Space API) con lectura en voz del texto detectado

Compatible con Chrome, Edge y Firefox (versiones modernas con soporte MV3).

## Estructura

- `manifest.json`: Configuracion principal de la extension.
- `popup.html` + `popup.css` + `popup.js`: Interfaz y logica del panel.
- `content.js`: Aplica los ajustes al documento actual.
- `styles.css`: Estilos inyectados para los modos de accesibilidad.

## Mejoras realizadas

- Flujo estandar: popup envia mensaje al content script (sin `executeScript` en cada click).
- Persistencia de ajustes con `storage.local`.
- Reglas por dominio: aplicar siempre, no aplicar nunca, o volver a configuracion global.
- Compatibilidad cruzada usando `browser` o `chrome` segun navegador.
- Atajos de teclado en pagina (Alt+Shift+1, 2, C, R, F, S).
- Controles mas finos para lectura y contraste.
- Validacion de pestanas no compatibles (`chrome://`, `edge://`, etc.).
- Manifest preparado para Firefox (`browser_specific_settings`).
- Bloque premium local sin API externa: resumen y simplificacion de contenido visible.
- Bloque OCR premium con API externa configurable por API key.

## Prueba local

### Chrome / Edge

1. Abre la pagina de extensiones:
	- Chrome: `chrome://extensions`
	- Edge: `edge://extensions`
2. Activa "Modo desarrollador".
3. Selecciona "Cargar extension descomprimida".
4. Elige la carpeta de este proyecto.

### Firefox

1. Abre `about:debugging#/runtime/this-firefox`.
2. Selecciona "Cargar complemento temporal".
3. Elige el archivo `manifest.json` de esta carpeta.

## Publicacion en tiendas

## 1) Chrome Web Store

1. Crea un ZIP con el contenido del proyecto (no incluir carpetas temporales ni `.git`).
2. Entra a Chrome Web Store Developer Dashboard.
3. Paga el registro unico de desarrollador (si aplica).
4. Sube el ZIP y completa:
	- Descripcion corta y larga
	- Capturas de pantalla
	- Iconos requeridos
	- Politica de privacidad (si usas datos sensibles)
5. Envia para revision.

## 2) Microsoft Edge Add-ons

1. Usa el mismo ZIP (normalmente compatible con cambios minimos).
2. Entra a Partner Center > Edge Add-ons.
3. Crea un nuevo envio y sube el paquete.
4. Completa metadata, categorias y soporte.
5. Envia para revision.

## 3) Firefox Add-ons (AMO)

1. Entra a addons.mozilla.org/developers.
2. Crea un nuevo complemento y sube un ZIP con esta extension.
3. Verifica que el `browser_specific_settings.gecko.id` sea unico para produccion.
4. Completa descripcion, capturas y politicas.
5. Envia para firma y revision.

## Checklist antes de publicar

- Cambiar `gecko.id` por dominio real del proyecto (ejemplo: `accesibilidad@tudominio.com`).
- Confirmar que `PinkyAcces.png` existe en 16, 48 y 128 o generar versiones separadas.
- Crear capturas del popup en uso real.
- Definir pagina de soporte y politica de privacidad.
- Probar en paginas pesadas para validar rendimiento.
- Incrementar version en `manifest.json` para cada release.

