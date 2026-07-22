# AtomicFlow — Frontend

Angular 17+, NgModule clásico (standalone: false), SSR activo (provideClientHydration).

## Estructura

- Servicios HTTP centrales: `src/app/core/services/api.ts` (todos los endpoints)
- Servicios de proyecto: `src/app/shared/services/project.service.ts`
- Páginas por rol: `src/app/pages/{director,coordinator,operator,admin,superoperario}/`
- Módulo director: `src/app/pages/director/director-module.ts`

## Reglas estrictas

- **Nunca** cambiar `*ngIf`/`*ngFor` a `@if`/`@for` — el proyecto no tiene el nuevo control flow habilitado
- **Siempre** `this.cdr.detectChanges()` al final de cada callback `next:` y `error:` en subscriptions (SSR requiere hydration manual)
- Autocomplete dropdowns: `position: fixed` con `getBoundingClientRect()` — no cambiar a `absolute`
- Inputs con autocomplete: patrón `[ngModel]="val" (ngModelChange)="val=$event; buscar()"` — no `[(ngModel)]` + `(input)`

## Notificaciones SSE

El backend expone `GET /api/notificaciones/stream?token=JWT`. Conectar con `EventSource` (no WebSocket).

## Backend (repositorio hermano)

Ruta: `c:\Users\dgdia\Documents\AtomoBack\AtomicFlow`
GitHub: `David-Diaz-Gomez/AtomicFlow`
