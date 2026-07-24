import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class Api {
  readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  private notifyError(msg: string) {
    Swal.fire({ icon: 'error', title: '¡Oops!', text: msg, confirmButtonColor: '#3085d6' });
  }

  /** Devuelve el ID del usuario guardado en localStorage. */
  getCurrentUserId(): number | null {
    try {
      const u = JSON.parse(localStorage.getItem('currentUser') ?? 'null');
      return u?.id ?? null;
    } catch { return null; }
  }

  /** Devuelve el token de acceso guardado en localStorage. */
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  login(correo: string, contrasenia: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/login`, { correo, contrasenia }).pipe(
      map((res: any) => {
        if (res?.success && res?.data) {
          const { access_token, refresh_token, usuario } = res.data;
          localStorage.setItem('token', access_token);
          if (refresh_token) localStorage.setItem('refresh_token', refresh_token);

          const userData = {
            id: usuario.id,
            name: `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim(),
            correo: usuario.correo,
            roleId: usuario.rol?.id ?? usuario.id_rol_usuario,
            roleName: usuario.rol?.nombre ?? '',
            mustChange: usuario.cambiar_contrasenia,
          };
          localStorage.setItem('currentUser', JSON.stringify(userData));

          Swal.fire({ icon: 'success', title: 'Bienvenido', text: `Hola, ${usuario.nombre}`, timer: 1500, showConfirmButton: false });
          return { success: true, user: userData };
        }
        return { success: false };
      }),
      catchError((error: HttpErrorResponse) => {
        const errorMsg = error.error?.message ?? error.error?.error ?? 'Ocurrió un error inesperado';
        this.notifyError(errorMsg);
        return throwError(() => error);
      })
    );
  }

  refreshToken(): Observable<any> {
    const refresh_token = localStorage.getItem('refresh_token');
    return this.http.post(`${this.baseUrl}/auth/refresh`, { refresh_token }).pipe(
      tap((res: any) => {
        if (res?.data?.access_token) localStorage.setItem('token', res.data.access_token);
      }),
      catchError(err => throwError(() => err))
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/logout`, {}).pipe(
      tap(() => { localStorage.removeItem('token'); localStorage.removeItem('refresh_token'); localStorage.removeItem('currentUser'); }),
      catchError(err => throwError(() => err))
    );
  }

  changePassword(data: { correo: string; currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/change-password`, data).pipe(
      tap(() => Swal.fire('Éxito', 'Contraseña actualizada correctamente', 'success')),
      catchError(err => {
        this.notifyError(err.error?.message ?? 'Error al cambiar la contraseña');
        return throwError(() => err);
      })
    );
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/forgot-password`, { email }).pipe(
      tap(() => Swal.fire('Enviado', 'Revisa tu correo electrónico', 'info'))
    );
  }

  resetPassword(data: { token: string; newPassword: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/reset-password`, data).pipe(
      tap(() => Swal.fire('Éxito', 'Ya puedes iniciar sesión con tu nueva clave', 'success'))
    );
  }

  setOperarioPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/operario/set-password`, { token, newPassword }).pipe(
      catchError((err: HttpErrorResponse) => throwError(() => err))
    );
  }

  // --- Usuarios (admin) ---

  saveUser(user: any): Observable<any> {
    const request = user.id
      ? this.http.put(`${this.baseUrl}/users/${user.id}`, user)
      : this.http.post(`${this.baseUrl}/users/register`, user);
    return request.pipe(
      tap(() => Swal.fire('¡Guardado!', 'El usuario ha sido procesado con éxito.', 'success')),
      catchError(err => { this.notifyError('No se pudo guardar el usuario.'); return throwError(() => err); })
    );
  }

  getRoles(): Observable<any[]> {
    console.log("API: Cargando roles desde el backend...");
    return this.http.get<any>(`${this.baseUrl}/roles`).pipe(map((r: any) => {
      console.log("Roles recibidos del backend:", r);
      return r?.data ?? r;
    }));
  }

  getTipoDocs(): Observable<any[]> {
    return this.http.get<any>(`${this.baseUrl}/tipo-documentos`).pipe(map((r: any) => {
      console.log("Tipos de documento recibidos del backend:", r);
      return r?.data ?? r;
    }));
  }

  getUsers(filters: any = {}): Observable<any> {

  let params = new HttpParams();

  Object.keys(filters).forEach(key => {
    const value = filters[key];

    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, value.toString());
    }
  });

  return this.http.get<any>(`${this.baseUrl}/users`, { params });
}

  updateStatus(id: number, status: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/users/${id}/status`, { estado: status }).pipe(
      catchError(err => { this.notifyError('No se pudo actualizar el estado.'); return throwError(() => err); })
    );
  }

  // ── SuperOperario ──────────────────────────────────────────────────────────

  getSuperOpOperarios(): Observable<any[]> {
    return this.http.get<any>(`${this.baseUrl}/superoperario/operarios`).pipe(
      map((r: any) => r?.data ?? r ?? []),
      catchError(() => of([]))
    );
  }

  getSuperOpTareas(fecha: string, idOperario?: number): Observable<any[]> {
    let params = new HttpParams().set('fecha', fecha);
    if (idOperario) params = params.set('id_operario', idOperario.toString());
    return this.http.get<any>(`${this.baseUrl}/superoperario/tareas`, { params }).pipe(
      map((r: any) => r?.data ?? r ?? []),
      catchError(() => of([]))
    );
  }

  verifyOperario(correo: string, contrasenia: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/auth/operario/verify`, { correo, contrasenia }).pipe(
      catchError((err: HttpErrorResponse) => throwError(() => err))
    );
  }

  completarTarea(tareaId: number, idOperario: number): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/superoperario/tareas/${tareaId}/completar`, { id_operario: idOperario }).pipe(
      tap(() => Swal.fire({ icon: 'success', title: '¡Completada!', text: 'Tarea marcada como completada.', timer: 1500, showConfirmButton: false })),
      catchError(err => { this.notifyError('No se pudo actualizar la tarea.'); return throwError(() => err); })
    );
  }

  /** Operario completa su tarea sin subir evidencia (T4.5). */
  completarTareaDirecta(tareaId: number, idOperario: number): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/tareas/${tareaId}/completar`, { id_operario: idOperario }).pipe(
      catchError(err => { this.notifyError('No se pudo completar la tarea.'); return throwError(() => err); })
    );
  }

  // ── Operario (autoservicio) ──────────────────────────────────────────────

  /** Lista de proyectos donde el operario tiene tareas asignadas, con avance. */
  getOperarioProyectos(idOperario: number): Observable<any[]> {
    const params = new HttpParams().set('id_operario', idOperario.toString());
    return this.http.get<any>(`${this.baseUrl}/operario/proyectos`, { params }).pipe(
      map((r: any) => r?.data ?? r ?? []),
      catchError(() => of([]))
    );
  }

  /** Detalle completo de una tarea (incluye evidencias y registros de horas). */
  getTareaDetalle(tareaId: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/tareas/${tareaId}`).pipe(
      map((r: any) => r?.data ?? r ?? null),
      catchError(() => of(null))
    );
  }

  /** Marca el inicio real de una tarea por parte del operario. */
  iniciarTarea(tareaId: number, idOperario: number): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/tareas/${tareaId}/iniciar`, { id_operario: idOperario }).pipe(
      catchError(err => { this.notifyError('No se pudo iniciar la tarea.'); return throwError(() => err); })
    );
  }

  /** Registra horas trabajadas por el operario en una tarea. */
  registrarHoras(tareaId: number, body: { fecha: string; hora_inicio: string; hora_fin: string; actividad: string }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/tareas/${tareaId}/horas`, body).pipe(
      catchError(err => { this.notifyError('No se pudo registrar el horario.'); return throwError(() => err); })
    );
  }

  // ── Pedidos ───────────────────────────────────────────────────────────────

  getPedidos(page = 1): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/pedidos?page=${page}`).pipe(
      map((r: any) => r?.data ?? r),
      catchError(() => of({ data: [], total: 0, page: 1, totalPages: 1 }))
    );
  }

  getPedidosByProject(idProyecto: number, page = 1): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/pedidos/proyecto/${idProyecto}?page=${page}`).pipe(
      map((r: any) => r?.data ?? r),
      catchError(() => of({ data: [], total: 0, page: 1, totalPages: 1 }))
    );
  }

  getProveedoresPedido(): Observable<string[]> {
    return this.http.get<any>(`${this.baseUrl}/pedidos/proveedores`).pipe(
      map((r: any) => r?.data ?? []),
      catchError(() => of([]))
    );
  }

  createPedido(body: {
    fecha_requerida: string;
    fecha_solicitud: number | string;
    proveedor: string;
    valor: number;
    detalle?: string | null;
    fecha_compra?: string | null;
    id_estado_pedido?: number;
    items: { id_detalle_recurso?: number | null; nombre_recurso_libre?: string | null; cantidad: number; valor_unitario: number; observacion?: string | null }[];
  }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/pedidos`, body).pipe(
      tap(() => Swal.fire({ icon: 'success', title: '¡Pedido registrado!', timer: 1600, showConfirmButton: false })),
      catchError(err => { this.notifyError('No se pudo registrar el pedido.'); return throwError(() => err); })
    );
  }

  updateEstadoPedido(id: number, id_estado_pedido: number): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/pedidos/${id}/estado`, { id_estado_pedido }).pipe(
      catchError(err => { this.notifyError('No se pudo actualizar el estado.'); return throwError(() => err); })
    );
  }

  getHistoricoPedido(idPedido: number): Observable<any[]> {
    return this.http.get<any>(`${this.baseUrl}/historico-pedido/pedido/${idPedido}`).pipe(
      map((r: any) => r?.data ?? []),
      catchError(() => of([]))
    );
  }

  crearHistoricoPedido(body: {
    fecha_recibido: string;
    observaciones?: string;
    id_pedido: number;
    items: { id_detalle_pedido_recurso: number; cantidad_recibida: number }[];
  }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/historico-pedido`, body).pipe(
      tap(() => Swal.fire({ icon: 'success', title: '¡Entrega registrada!', timer: 1500, showConfirmButton: false })),
      map((r: any) => r?.data ?? r),
      catchError(err => { this.notifyError(err.error?.message ?? 'No se pudo registrar la entrega.'); return throwError(() => err); })
    );
  }

  updatePedido(id: number, body: { fecha_compra?: string | null; id_estado_pedido?: number; proveedor?: string; valor?: number; fecha_requerida?: string; detalle?: string | null; cantidad_solicitada?: number }): Observable<any> {
    return this.http.put<any>(`${this.baseUrl}/pedidos/${id}`, body).pipe(
      tap(() => Swal.fire({ icon: 'success', title: '¡Pedido actualizado!', timer: 1500, showConfirmButton: false })),
      catchError(err => { this.notifyError('No se pudo actualizar el pedido.'); return throwError(() => err); })
    );
  }

  inhabilitarPedido(id: number): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/pedidos/${id}/inhabilitar`, {}).pipe(
      tap(() => Swal.fire({ icon: 'success', title: 'Pedido inhabilitado', timer: 1500, showConfirmButton: false })),
      catchError(err => { this.notifyError('No se pudo inhabilitar el pedido.'); return throwError(() => err); })
    );
  }

  getRecursosParaPedido(idProyecto: number): Observable<{ id_detalle_recurso: number; nombre_recurso: string; tipo_recurso: string; observaciones: string | null; precio_unitario: number; cantidad: number }[]> {
    return this.http.get<any>(`${this.baseUrl}/proyectos/${idProyecto}/recursos-pedido`).pipe(
      map((r: any) => r?.data ?? []),
      catchError(() => of([]))
    );
  }

  createSolicitudRecurso(idProyecto: number, body: { nombre: string; tipo_recurso: string; precio_unitario: number; cantidad: number; observaciones?: string; id_pedido?: number | null; id_mueble?: number | null }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/proyectos/${idProyecto}/solicitud-recurso`, body).pipe(
      catchError(err => { this.notifyError('No se pudo crear la solicitud.'); return throwError(() => err); })
    );
  }

  getSolicitudesRecurso(idProyecto: number, todas = false): Observable<any[]> {
    return this.http.get<any>(`${this.baseUrl}/proyectos/${idProyecto}/solicitudes-recurso?todas=${todas}`).pipe(
      map((r: any) => r?.data ?? []),
      catchError(() => of([]))
    );
  }

  aprobarSolicitudRecurso(id: number): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/solicitudes-recurso/${id}/aprobar`, {}).pipe(
      tap(() => Swal.fire({ icon: 'success', title: '¡Recurso aprobado!', text: 'Ya aparece en los recursos del proyecto.', timer: 1800, showConfirmButton: false })),
      catchError(err => { this.notifyError('No se pudo aprobar la solicitud.'); return throwError(() => err); })
    );
  }

  rechazarSolicitudRecurso(id: number, motivo: string): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/solicitudes-recurso/${id}/rechazar`, { motivo }).pipe(
      catchError(err => { this.notifyError('No se pudo rechazar la solicitud.'); return throwError(() => err); })
    );
  }

  getAllSolicitudesPendientes(): Observable<any[]> {
    return this.http.get<any>(`${this.baseUrl}/solicitudes-recurso/pendientes`).pipe(
      map((r: any) => r?.data ?? []),
      catchError(() => of([]))
    );
  }

  // ── Vista General / Plantillas ────────────────────────────────────────────

  getVistaGeneralProyectos(): Observable<any[]> {
    return this.http.get<any>(`${this.baseUrl}/proyectos/vista-general`).pipe(
      map((r: any) => r?.data ?? r ?? []),
      catchError(() => of([]))
    );
  }

  getProyectoFasesGantt(id: number): Observable<any[]> {
    return this.http.get<any>(`${this.baseUrl}/proyectos/${id}/fases/gantt`).pipe(
      map((r: any) => r?.data ?? r ?? []),
      catchError(() => of([]))
    );
  }

  crearFasesBatch(proyectoId: number, fases: any[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/proyectos/${proyectoId}/fases/batch`, { fases }).pipe(
      tap(() => Swal.fire({ icon: 'success', title: '¡Listo!', text: 'Fases y tareas creadas correctamente.', timer: 1800, showConfirmButton: false })),
      catchError(err => { this.notifyError('No se pudieron crear las fases.'); return throwError(() => err); })
    );
  }

  getMenuForRole(roleId: number): any[] {
    const menus: any = {
      1: [
        { title: 'Dashboard',      icon: 'fa-bar-chart',    route: '/dashboard/admin/home' },
        { title: 'Usuarios',       icon: 'fa-users',        route: '/dashboard/admin/users' },
        { title: 'Vista General',  icon: 'fa-globe',        route: '/dashboard/admin/vista-general' },
      ],
      2: [
        { title: 'Mis Proyectos',  icon: 'fa-briefcase',    route: '/dashboard/director/home' },
        { title: 'Nuevo Proyecto', icon: 'fa-plus-circle',  route: '/dashboard/director/project-new' },
        { title: 'Vista General',  icon: 'fa-globe',        route: '/dashboard/director/vista-general' },
        { title: 'Cronograma',     icon: 'fa-bar-chart',    route: '/dashboard/director/gantt' },
        { title: 'Evidencias',       icon: 'fa-camera',       route: '/dashboard/director/evidencias' },
        { title: 'Aprobaciones',     icon: 'fa-check-circle', route: '/dashboard/director/approvals' },
        { title: 'Estados de Compra', icon: 'fa-shopping-cart', route: '/dashboard/director/estados-compra' },
      ],
      3: [
        { title: 'Mis Proyectos',    icon: 'fa-briefcase',    route: '/dashboard/coordinator/home' },
        { title: 'Cronograma',       icon: 'fa-bar-chart',    route: '/dashboard/coordinator/gantt' },
        { title: 'Evidencias',       icon: 'fa-camera',       route: '/dashboard/coordinator/evidences' },
        { title: 'Estados de Compra', icon: 'fa-shopping-cart', route: '/dashboard/coordinator/estados-compra' },
      ],
      4: [
        { title: 'Inicio',         icon: 'fa-home',      route: '/dashboard/operator/home' },
        { title: 'Calendario',     icon: 'fa-calendar',  route: '/dashboard/operator/calendar' },
        { title: 'Proyectos',      icon: 'fa-briefcase', route: '/dashboard/operator/projects' },
        { title: 'Notificaciones', icon: 'fa-bell',      route: '/dashboard/operator/notifications' },
      ],
      5: [
        { title: 'Kiosko', icon: 'fa-desktop', route: '/dashboard/superoperario/home' },
      ],
    };
    return menus[roleId] ?? [];
  }
}