# AtomicFlow Frontend — Contexto de Vistas

## Stack

- **Framework**: Angular 21.2.0 (Module-based + Lazy Loading)
- **Styling**: Bootstrap 5.3.8 + SCSS
- **UI**: SweetAlert2 (feedback de usuario)
- **Estado**: localStorage + RxJS (sin NgRx)
- **API Base**: `https://atomic.atomicflow.com.co/api`

---

## Arquitectura de Rutas

```
/
├── /auth/login
├── /auth/recover
├── /auth/change-password
└── /dashboard/
    ├── /admin/
    │   ├── home        → Projects
    │   ├── users
    │   └── reports
    ├── /coordinator/
    │   ├── home        → Phases
    │   ├── phases
    │   ├── tasks
    │   └── approvals
    ├── /director/
    │   ├── home        → Projects
    │   ├── projects
    │   ├── gantt
    │   └── resources
    └── /operator/
        ├── home        → Calendar
        ├── calendar
        └── evidences
```

---

## Módulo AUTH

### Login — `/auth/login`

**Archivo**: [src/app/pages/auth/login/login.ts](src/app/pages/auth/login/login.ts)

Pantalla de inicio de sesión. El usuario ingresa correo y contraseña. Al autenticar exitosamente, la respuesta incluye `roleId` y el flag `mustChange`. Si `mustChange === 1`, redirige a `/auth/change-password`; de lo contrario, redirige al dashboard del rol correspondiente (`/dashboard/{admin|coordinator|director|operator}/home`). Guarda `token` y `currentUser` en `localStorage`.

**Campos**: correo, contraseña.
**Acciones**: login → API `POST /login`.

---

### Recover — `/auth/recover`

**Archivo**: [src/app/pages/auth/recover/recover.ts](src/app/pages/auth/recover/recover.ts)

Pantalla de recuperación de contraseña. El usuario ingresa su correo y el sistema envía un email con un enlace que incluye un token en la URL (`/auth/change-password?token=xyz`).

**Campos**: correo.
**Acciones**: enviar solicitud → API `POST /forgot-password`.

---

### Change Password — `/auth/change-password`

**Archivo**: [src/app/pages/auth/change-password/change-password.ts](src/app/pages/auth/change-password/change-password.ts)

Vista de doble propósito:

1. **Primer ingreso**: Lee `tempEmail` y `tempPass` de `localStorage` (guardados en login). El usuario define su nueva contraseña. Envía `{ correo, currentPassword, newPassword }`.
2. **Reset vía token**: Lee el parámetro `token` de la URL (flujo de recuperación). Envía `{ token, newPassword }`.

Tras cambio exitoso, redirige a `/auth/login`.

**Campos**: nueva contraseña, confirmación.
**Acciones**: cambiar contraseña → API `POST /reset-password` o `POST /change-password`.

---

## Dashboard Container — `/dashboard`

**Archivo**: [src/app/pages/dashboard/dashboard.ts](src/app/pages/dashboard/dashboard.ts)

Componente contenedor que envuelve todas las vistas post-login. Incluye el **Sidebar** lateral y el **Footer**. Renderiza las sub-vistas de cada rol mediante `<router-outlet>`. Redirige por defecto al módulo de admin.

No tiene lógica propia de negocio; es la capa de layout.

---

## Módulo ADMIN — `roleId: 1`

### Admin Home / Projects — `/dashboard/admin/home`

**Archivo**: [src/app/pages/admin/projects/projects.ts](src/app/pages/admin/projects/projects.ts)

Vista principal del administrador. Actualmente es la pantalla de inicio tras login para el rol Admin. En su estado actual sirve como placeholder para el dashboard de proyectos desde la perspectiva administrativa.

---

### Users — `/dashboard/admin/users`

**Archivo**: [src/app/pages/admin/users/users.ts](src/app/pages/admin/users/users.ts)

Panel CRUD completo de gestión de usuarios del sistema. Es la vista más desarrollada del módulo admin.

**Funcionalidades**:
- Listar usuarios con paginación (5 por página)
- Filtrar por nombre y por rol
- Crear usuario (modal con formulario)
- Editar usuario existente (mismo modal, datos pre-cargados)
- Inactivar usuario (cambio de estado vía PATCH)

**Estructura del usuario**:
```
ID, Numero_Documento, ID_Tipo_Documento, Nombre, Apellido,
Correo, Telefono, Direccion, RH, ARL, EPS, ID_Rol_Usuario
```

**Roles disponibles**: Admin (1), Coordinador (2), Director (3), Operario (4)

**Acciones API**: `getUsers()`, `saveUser()`, `updateStatus()`, `getRoles()`, `getTipoDocs()`

---

### Reports — `/dashboard/admin/reports`

**Archivo**: [src/app/pages/admin/reports/reports.ts](src/app/pages/admin/reports/reports.ts)

Vista de reportes y análisis para el administrador. Estructura creada, pendiente de implementación de contenido.

---

## Módulo COORDINATOR — `roleId: 2`

### Phases — `/dashboard/coordinator/phases`

**Archivo**: [src/app/pages/coordinator/phases/phases.ts](src/app/pages/coordinator/phases/phases.ts)

Vista principal del coordinador. Gestión de fases de los proyectos asignados. Un coordinador supervisa las fases de ejecución de un proyecto y desde aquí puede ver su estado, avance y detalles.

Vista pendiente de implementación de lógica de datos.

---

### Tasks — `/dashboard/coordinator/tasks`

**Archivo**: [src/app/pages/coordinator/tasks/tasks.ts](src/app/pages/coordinator/tasks/tasks.ts)

Gestión de tareas dentro de las fases. El coordinador puede ver, crear y asignar tareas a operarios. Vinculada a la fase activa del proyecto coordinado.

Vista pendiente de implementación de lógica de datos.

---

### Approvals — `/dashboard/coordinator/approvals`

**Archivo**: [src/app/pages/coordinator/approvals/approvals.ts](src/app/pages/coordinator/approvals/approvals.ts)

Panel de aprobaciones y validaciones de tareas. El coordinador revisa las evidencias o resultados entregados por los operarios y aprueba o rechaza las tareas completadas.

Vista pendiente de implementación de lógica de datos.

---

## Módulo DIRECTOR — `roleId: 3`

### Director Home / Projects — `/dashboard/director/home`

**Archivo**: [src/app/pages/director/projects/projects.ts](src/app/pages/director/projects/projects.ts)

Vista principal del director. Muestra los proyectos bajo su supervisión. El director tiene visibilidad de alto nivel sobre el estado general de los proyectos.

Vista pendiente de implementación de lógica de datos.

---

### Gantt — `/dashboard/director/gantt`

**Archivo**: [src/app/pages/director/gantt/gantt.ts](src/app/pages/director/gantt/gantt.ts)

Diagrama de Gantt para visualización del cronograma de proyectos. Permite al director ver el avance temporal de fases y tareas. Es la vista de seguimiento de tiempos más importante para este rol.

Vista pendiente de implementación de lógica de datos.

---

### Resources — `/dashboard/director/resources`

**Archivo**: [src/app/pages/director/resources/resources.ts](src/app/pages/director/resources/resources.ts)

Gestión y visualización de recursos humanos y materiales asignados a los proyectos del director. Permite controlar la asignación de operarios y coordinadores.

Vista pendiente de implementación de lógica de datos.

---

## Módulo OPERATOR — `roleId: 4`

### Calendar — `/dashboard/operator/calendar`

**Archivo**: [src/app/pages/operator/calendar/calendar.ts](src/app/pages/operator/calendar/calendar.ts)

Vista principal del operario. Calendario con las tareas asignadas organizadas por fecha. El operario consulta aquí su agenda de trabajo y puede ver el detalle de cada tarea pendiente o en progreso.

Vista pendiente de implementación de lógica de datos.

---

### Evidences — `/dashboard/operator/evidences`

**Archivo**: [src/app/pages/operator/evidences/evidences.ts](src/app/pages/operator/evidences/evidences.ts)

Registro y carga de evidencias de trabajo. El operario sube fotos, documentos u otros comprobantes que demuestren la ejecución de una tarea. Estas evidencias son revisadas por el coordinador en su vista de Approvals.

Vista pendiente de implementación de lógica de datos.

---

## Componentes Compartidos

### Sidebar — `<app-sidebar>`

**Archivo**: [src/app/shared/components/sidebar/sidebar.ts](src/app/shared/components/sidebar/sidebar.ts)

Navegación lateral presente en todas las vistas del dashboard. Genera el menú dinámicamente según el `roleId` del usuario almacenado en `localStorage`. Incluye nombre y rol del usuario activo, y botón de logout que limpia el `localStorage` y redirige a `/auth/login`. Responsive con hamburger menu en móvil.

El menú se genera mediante `getMenuForRole(roleId)` en el servicio API.

### Footer — `<app-footer>`

**Archivo**: [src/app/shared/components/footer/footer.ts](src/app/shared/components/footer/footer.ts)

Pie de página del dashboard. Sin contenido funcional implementado actualmente.

---

## Servicio Central de API

**Archivo**: [src/app/core/services/api.ts](src/app/core/services/api.ts)

Servicio `HttpClient` centralizado. Todos los métodos muestran feedback automático con SweetAlert2 (éxito y error). No hay interceptor HTTP; los headers de autorización deben añadirse en cada petición o mediante un interceptor futuro.

| Método | Endpoint | Uso |
|--------|----------|-----|
| `login()` | `POST /login` | Autenticación |
| `forgotPassword()` | `POST /forgot-password` | Recuperar contraseña |
| `resetPassword()` | `POST /reset-password` | Reset vía token |
| `changePassword()` | `POST /change-password` | Cambio primer ingreso |
| `getUsers()` | `GET /users` | Listar usuarios (paginado) |
| `saveUser()` | `POST/PUT /users` | Crear o editar usuario |
| `updateStatus()` | `PATCH /users/:id` | Inactivar usuario |
| `getRoles()` | `GET /roles` | Listar roles |
| `getTipoDocs()` | `GET /tipo-documentos` | Listar tipos de doc |
| `getMenuForRole()` | local | Menú dinámico por rol |

---

## Estado de Implementación

| Vista | Ruta | Estado |
|-------|------|--------|
| Login | `/auth/login` | Completo |
| Recover | `/auth/recover` | Completo |
| Change Password | `/auth/change-password` | Completo |
| Dashboard Container | `/dashboard` | Completo |
| Admin Users | `/dashboard/admin/users` | Completo |
| Admin Projects | `/dashboard/admin/home` | Pendiente |
| Admin Reports | `/dashboard/admin/reports` | Pendiente |
| Coordinator Phases | `/dashboard/coordinator/phases` | Pendiente |
| Coordinator Tasks | `/dashboard/coordinator/tasks` | Pendiente |
| Coordinator Approvals | `/dashboard/coordinator/approvals` | Pendiente |
| Director Projects | `/dashboard/director/projects` | Pendiente |
| Director Gantt | `/dashboard/director/gantt` | Pendiente |
| Director Resources | `/dashboard/director/resources` | Pendiente |
| Operator Calendar | `/dashboard/operator/calendar` | Pendiente |
| Operator Evidences | `/dashboard/operator/evidences` | Pendiente |

---

## Notas Arquitecturales

- **Sin Guards**: Las rutas no están protegidas. Cualquier usuario puede navegar a cualquier módulo sin autenticación.
- **Persistencia de sesión**: Solo `localStorage`. No hay refresh token ni expiración manejada en cliente.
- **Menú del Director (roleId 3)**: `getMenuForRole()` en `api.ts` no tiene items definidos para este rol — pendiente completar.
- **Lazy Loading**: Los módulos `admin`, `coordinator`, `director` y `operator` se cargan bajo demanda para optimizar el bundle inicial.
