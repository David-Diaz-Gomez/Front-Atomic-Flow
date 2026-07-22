import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Api } from '../../core/services/api';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private get base() { return this.api.baseUrl; }

  constructor(private http: HttpClient, private api: Api) {}

  // ── Proyectos ──────────────────────────────────────────────────────────────

  getProjects(filters: Record<string, any> = {}): Observable<{ data: any[]; pagination: any }> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<any>(`${this.base}/proyectos`, { params }).pipe(
      map(r => ({
        data: (r?.data ?? []).map((p: any) => this.normalizeProject(p)),
        pagination: r?.pagination ?? {}
        
      }))
    );
  }

  /**
   * La BD tiene estado = NULL en proyectos creados antes del API.
   * Derivamos un estado legible desde el campo `aprobado` como fallback.
   */
  private normalizeProject(p: any): any {
    if (p.estado) return p;
    const estadoDerivado = p.aprobado == 1 ? 'aprobado' : 'borrador';
    return { ...p, estado: estadoDerivado };
  }

  getProject(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/proyectos/${id}`).pipe(
      map(r => {
        const p = r?.data?.data ?? r?.data ?? r;
        return this.normalizeProject(p);
      })
    );
  }

  createProject(body: any): Observable<any> {
    return this.http.post<any>(`${this.base}/proyectos`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  updateProject(id: number, body: any): Observable<any> {
    return this.http.put<any>(`${this.base}/proyectos/${id}`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  getProjectMuebles(id: number): Observable<any[]> {
    return this.http.get<any>(`${this.base}/proyectos/${id}/muebles`).pipe(
      map(r => r?.data ?? r ?? [])
    );
  }

  uploadProjectImage(id: number, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('imagen', file);
    return this.http.post<any>(`${this.base}/proyectos/${id}/imagen`, fd).pipe(
      map(r => r?.data ?? r)
    );
  }

  approveProject(id: number, aprobado: boolean): Observable<any> {
    return this.http.patch<any>(`${this.base}/proyectos/${id}/aprobado`, { aprobado }).pipe(
      map(r => r?.data ?? r)
    );
  }

  changeProjectStatus(id: number, estado: string): Observable<any> {
    return this.http.patch<any>(`${this.base}/proyectos/${id}/estado`, { estado }).pipe(
      map(r => r?.data ?? r)
    );
  }

  validateProjectDates(id: number, body: { fecha_inicio: string; fecha_fin: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/proyectos/${id}/validar-fechas`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  /**
   * Actualiza únicamente las fechas de un proyecto EN PRODUCCIÓN, registrando
   * el cambio en un histórico, sin alterar el estado del proyecto.
   * NUEVO ENDPOINT — pendiente de implementar en backend (ver MD de backend).
   */
  updateProjectDates(id: number, body: { fecha_inicio: string; fecha_fin: string; motivo?: string }): Observable<any> {
    return this.http.patch<any>(`${this.base}/proyectos/${id}/fechas`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  /**
   * Notifica a todos los usuarios con rol Director que un proyecto en
   * producción/aprobado tuvo cambios en materiales/insumos y requiere
   * re-aprobación.
   * NUEVO ENDPOINT — pendiente de implementar en backend (ver MD de backend).
   */
  notifyResourceChange(id: number): Observable<any> {
    return this.http.post<any>(`${this.base}/proyectos/${id}/notificar-cambio-recursos`, {}).pipe(
      map(r => r?.data ?? r)
    );
  }

  getProjectConflicts(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/proyectos/${id}/conflictos`).pipe(
      map(r => r?.data ?? r)
    );
  }

  // ── Recursos del proyecto ──────────────────────────────────────────────────

  getProjectResources(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/proyectos/${id}/recursos`).pipe(
      map(r => r?.data?.data ?? r?.data ?? r)
    );
  }

  getResourcesSummary(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/proyectos/${id}/recursos/resumen`).pipe(
      map(r => r?.data ?? r)
    );
  }

  addResource(projectId: number, body: any): Observable<any> {
    return this.http.post<any>(`${this.base}/proyectos/${projectId}/recursos`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  updateResource(projectId: number, detailId: number, body: any): Observable<any> {
    return this.http.put<any>(`${this.base}/proyectos/${projectId}/recursos/${detailId}`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  deleteResource(projectId: number, detailId: number): Observable<any> {
    return this.http.delete<any>(`${this.base}/proyectos/${projectId}/recursos/${detailId}`).pipe(
      map(r => r?.data ?? r)
    );
  }

  // ── Maquinaria ─────────────────────────────────────────────────────────────

  getMachineryWeeklyOccupancy(desde: string, hasta: string, idProyecto: number | null): Observable<any> {
    const params: any = { desde, hasta };
    if (idProyecto) params.id_proyecto = idProyecto;
    return this.http.get<any>(`${this.base}/maquinaria/ocupacion-semanal`, { params }).pipe(
      map(r => r?.data ?? r)
    );
  }

  // ── Fases ──────────────────────────────────────────────────────────────────

  getFases(projectId: number): Observable<any[]> {
    return this.http.get<any>(`${this.base}/proyectos/${projectId}/fases`).pipe(
      map(r => r?.data ?? [])
    );
  }

  getFase(projectId: number, faseId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/proyectos/${projectId}/fases/${faseId}`).pipe(
      map(r => r?.data ?? r)
    );
  }

  createFase(projectId: number, body: any): Observable<any> {
    return this.http.post<any>(`${this.base}/proyectos/${projectId}/fases`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  updateFase(projectId: number, faseId: number, body: any): Observable<any> {
    return this.http.put<any>(`${this.base}/proyectos/${projectId}/fases/${faseId}`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  deleteFase(projectId: number, faseId: number): Observable<any> {
    return this.http.delete<any>(`${this.base}/proyectos/${projectId}/fases/${faseId}`).pipe(
      map(r => r?.data ?? r)
    );
  }

  validateFaseDates(projectId: number, body: { fecha_inicio: string; fecha_fin: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/proyectos/${projectId}/fases/validar-fechas`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  delegateFase(projectId: number, faseId: number, body: { id_coordinador: number; instrucciones?: string; insumos_aplicados?: number[] }): Observable<any> {
    return this.http.patch<any>(`${this.base}/proyectos/${projectId}/fases/${faseId}/delegar`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  // ── Tareas ─────────────────────────────────────────────────────────────────

  getTareas(faseId: number): Observable<any[]> {
    return this.http.get<any>(`${this.base}/fases/${faseId}/tareas`).pipe(
      map(r => r?.data?.data ?? r?.data ?? [])
    );
  }

  createTarea(faseId: number, body: any): Observable<any> {
    return this.http.post<any>(`${this.base}/fases/${faseId}/tareas`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  updateTarea(faseId: number, tareaId: number, body: any): Observable<any> {
    return this.http.put<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  changeTareaStatus(faseId: number, tareaId: number, estado: string, motivo?: string): Observable<any> {
    return this.http.patch<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/estado`, { estado, motivo }).pipe(
      map(r => r?.data ?? r)
    );
  }

  inactivarTarea(faseId: number, tareaId: number, forzar = false): Observable<any> {
    return this.http.patch<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/inactivar`, { forzar }).pipe(
      map(r => r?.data ?? r)
    );
  }

  rescheduleTarea(faseId: number, tareaId: number, body: { fecha_inicio: string; fecha_fin: string }): Observable<any> {
    return this.http.patch<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/fechas`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  assignOperario(faseId: number, tareaId: number, body: any): Observable<any> {
    return this.http.post<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/operarios`, body).pipe(map(r => r?.data ?? r));
  }

  assignMaquinaria(faseId: number, tareaId: number, body: any): Observable<any> {
    return this.http.post<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/maquinaria`, body).pipe(map(r => r?.data ?? r));
  }

  saveInsumos(faseId: number, tareaId: number, ids: number[]): Observable<any> {
    return this.http.patch<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/insumos`, { ids }).pipe(map(r => r?.data ?? r));
  }

  getOperarios(): Observable<any[]> {
    return this.http.get<any>(`${this.base}/operarios`).pipe(
      map(r => Array.isArray(r) ? r : (r?.data ?? []))
    );
  }

  getMaquinaria(): Observable<any[]> {
    return this.http.get<any>(`${this.base}/maquinaria`).pipe(
      map(r => Array.isArray(r) ? r : (r?.data ?? []))
    );
  }

  getCoordinadorKpis(): Observable<any> {
    return this.http.get<any>(`${this.base}/coordinador/kpis`).pipe(
      map(r => r?.data ?? r)
    );
  }

  getEvidencias(params: Record<string, any> = {}): Observable<any> {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') hp = hp.set(k, String(v));
    });
    return this.http.get<any>(`${this.base}/evidencias`, { params: hp }).pipe(
      map(r => Array.isArray(r) ? r : (r?.data ?? []))
    );
  }

  getMaqOccupancy(desde: string, hasta: string): Observable<any[]> {
    return this.getMachineryWeeklyOccupancy(desde, hasta, null).pipe(
      map(r => Array.isArray(r) ? r : (r?.data ?? []))
    );
  }

  getOperarioOccupancy(desde: string, hasta: string): Observable<any[]> {
    return this.http.get<any>(`${this.base}/operarios/ocupacion`, { params: { desde, hasta } }).pipe(
      map(r => Array.isArray(r) ? r : (r?.data ?? []))
    );
  }

  removeOperario(faseId: number, tareaId: number, userId: number): Observable<any> {
    return this.http.delete<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/operarios/${userId}`).pipe(map(r => r?.data ?? r));
  }

  removeMaquina(faseId: number, tareaId: number, maqId: number): Observable<any> {
    return this.http.delete<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/maquinaria/${maqId}`).pipe(map(r => r?.data ?? r));
  }

  getTareaHorario(faseId: number, tareaId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/fases/${faseId}/tareas/${tareaId}/horario`).pipe(
      map(r => r?.data ?? r)
    );
  }

  /**
   * Devuelve proyecto completo con fases y sus tareas (3 niveles).
   * Hace: GET /proyectos/:id → GET /proyectos/:id/fases → GET /fases/:id/tareas (por cada fase).
   */
  getProjectFull(id: number): Observable<any> {
    return this.getProject(id).pipe(
      switchMap(project =>
        this.getFases(id).pipe(
          switchMap(fases => {
            if (!fases.length) return of({ ...project, fases: [] });
            return forkJoin(
              fases.map(fase =>
                this.getTareas(fase.id).pipe(
                  map(tareas => ({ ...fase, tareas }))
                )
              )
            ).pipe(map(fasesConTareas => ({ ...project, fases: fasesConTareas })));
          })
        )
      )
    );
  }

  // ── Coordinador ────────────────────────────────────────────────────────────

  getTareasCompletadas(idCoordinador: number, idProyecto?: number): Observable<any[]> {
    let params = new HttpParams().set('id_coordinador', String(idCoordinador));
    if (idProyecto) params = params.set('id_proyecto', String(idProyecto));
    return this.http.get<any>(`${this.base}/coordinador/tareas-completadas`, { params }).pipe(
      map(r => r?.data ?? r ?? [])
    );
  }

  subirEvidencias(tareaId: number, fd: FormData): Observable<any> {
    return this.http.post<any>(`${this.base}/tareas/${tareaId}/evidencias`, fd).pipe(
      map(r => r?.data ?? r)
    );
  }

  reasignarTarea(tareaId: number, body: any): Observable<any> {
    return this.http.post<any>(`${this.base}/tareas/${tareaId}/reasignar`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  getOperarioDisponibilidad(operarioId: number, fecha: string): Observable<any> {
    return this.http.get<any>(`${this.base}/operarios/${operarioId}/disponibilidad`, { params: { fecha } }).pipe(
      map(r => r?.data ?? r)
    );
  }
}
