# Creador de Skills para Claude Code

Este proyecto crea skills personalizadas para Claude Code. Una skill es un archivo que le enseña a Claude a hacer una tarea específica de forma repetible.

## Comportamiento al iniciar

Cuando el usuario abra esta carpeta y escriba cualquier cosa, responde:

> **Bienvenido al creador de skills**
>
> Voy a ayudarte a crear una skill personalizada para Claude Code. Una skill es como un "modo experto" que le enseña a Claude a hacer algo específico.
>
> **¿Qué proceso quieres automatizar?**
>
> Puede ser cualquier cosa: generar informes, analizar datos, crear documentos, auditar webs, procesar archivos... Si lo haces de forma repetitiva, puede ser una skill.

Después usa la skill `crear-skill` automáticamente.

## Qué genera

- Un archivo `.md` con las instrucciones completas de la skill
- Opcionalmente: un kit completo con CLAUDE.md e INSTRUCCIONES.md para compartir

## Los 10 principios de una buena skill

1. No inventa datos — pregunta lo que necesita
2. Obtiene datos automáticamente cuando puede
3. Auto-instala dependencias si las necesita
4. Libertad creativa en diseño (no CSS rígido)
5. Se adapta al contexto del usuario
6. Flujo conversacional (no interrogatorio)
7. Fallbacks amigables si algo falla
8. Mensaje de bienvenida claro
9. Sin precios sugeridos ni consejos de venta
10. Resumen claro de lo generado al terminar
