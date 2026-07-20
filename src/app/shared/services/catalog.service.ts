import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../../core/services/api';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private get base() { return this.api.baseUrl; }

  constructor(private http: HttpClient, private api: Api) {}

  // ── Clientes ── GET /clientes · POST /clientes · PUT /clientes/:id · DELETE /clientes/:id

  getClientes(filters: Record<string, any> = {}): Observable<{ data: any[]; pagination: any }> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<any>(`${this.base}/clientes`, { params }).pipe(
      map(r => ({ data: r?.data ?? [], pagination: r?.pagination ?? {} }))
    );
  }

  createCliente(body: any): Observable<any> {
    return this.http.post<any>(`${this.base}/clientes`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  updateCliente(id: number, body: any): Observable<any> {
    return this.http.put<any>(`${this.base}/clientes/${id}`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  deleteCliente(id: number): Observable<any> {
    return this.http.delete<any>(`${this.base}/clientes/${id}`).pipe(
      map(r => r?.data ?? r)
    );
  }

  // ── Usuarios ── GET /users?role=&status=&search=&page=&limit=

  /** role: 2=Director 3=Coordinador 4=Operario · status: 1=activo (default) */
  getUsersByRole(role: number, status = 1): Observable<any[]> {
    let params = new HttpParams()
      .set('role', String(role))
      .set('status', String(status))
      .set('limit', '200');
    return this.http.get<any>(`${this.base}/users`, { params }).pipe(
      map(r => r?.data ?? [])
    );
  }

  // ── Recursos catálogo ── GET /recursos · GET /recursos/tipos-recurso

  getRecursos(filters: Record<string, any> = {}): Observable<{ data: any[]; pagination: any }> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<any>(`${this.base}/recursos`, { params }).pipe(
      map(r => ({ data: r?.data ?? [], pagination: r?.pagination ?? {} }))
    );
  }

  getTiposRecurso(): Observable<any[]> {
    return this.http.get<any>(`${this.base}/recursos/tipos-recurso`).pipe(
      map(r => r?.data ?? [])
    );
  }

  // ── Maquinaria ── GET /maquinaria
  getMaquinaria(): Observable<any[]> {
    return this.http.get<any>(`${this.base}/maquinaria`).pipe(
      map(r => r?.data ?? [])
    );
  }

  // ── Tipos de tarea ── GET /tipos-tarea · POST /tipos-tarea

  getTiposTarea(): Observable<any[]> {
    return this.http.get<any>(`${this.base}/tipos-tarea`).pipe(
      map(r => r?.data ?? [])
    );
  }

  createTipoTarea(body: { nombre: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/tipos-tarea`, body).pipe(
      map(r => r?.data ?? r)
    );
  }

  // ── Tipos de documento ── GET /tipo-documentos

  getTiposDocumento(): Observable<any[]> {
    return this.http.get<any>(`${this.base}/tipo-documentos`).pipe(
      map(r => r?.data ?? [])
    );
  }

  // ── Roles ── GET /roles

  getRoles(): Observable<any[]> {
    return this.http.get<any>(`${this.base}/roles`).pipe(
      map(r => r?.data ?? r)
    );
  }
}
