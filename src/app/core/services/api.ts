import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
// Agregamos 'tap' a la lista de operadores
import { catchError, map, tap } from 'rxjs/operators';
import Swal from 'sweetalert2'; // 👈 Importamos SweetAlert

@Injectable({ providedIn: 'root' })
export class Api {
  private baseUrl = 'https://atomic.atomicflow.com.co/api';

  constructor(private http: HttpClient) { }

  // --- UTILIDAD PARA ALERTAS REUTILIZABLES ---
  private notifyError(msg: string) {
    Swal.fire({
      icon: 'error',
      title: '¡Oops!',
      text: msg,
      confirmButtonColor: '#3085d6'
    });
  }

  // --- MÉTODOS MEJORADOS ---

  login(correo: string, contrasenia: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/users/login`, { correo, contrasenia }).pipe(
      map((res: any) => {
        if (res && res.token) {
          localStorage.setItem('token', res.token);
          const userData = {
            name: res.nombre,
            roleId: res.rol,
            mustChange: res.cambiar_contrasenia
          };
          localStorage.setItem('currentUser', JSON.stringify(userData));
          
          // Alerta de éxito opcional (puedes quitarla si prefieres ir directo al dashboard)
          Swal.fire({
            icon: 'success',
            title: 'Bienvenido',
            text: `Hola, ${res.nombre}`,
            timer: 1500,
            showConfirmButton: false
          });

          return { success: true, user: userData };
        }
        return { success: false };
      }),
      catchError((error: HttpErrorResponse) => {
        // 🚨 Aquí capturamos tu error 401 "Contraseña incorrecta"
        let errorMsg = 'Ocurrió un error inesperado';
        
        if (error.error && error.error.error) {
          errorMsg = error.error.error; // Extrae "Contraseña incorrecta" o "Usuario no encontrado"
        }

        this.notifyError(errorMsg);
        return throwError(() => error);
      })
    );
  }

  saveUser(user: any): Observable<any> {
    const request = user.ID 
      ? this.http.put(`${this.baseUrl}/users/${user.ID}`, user)
      : this.http.post(`${this.baseUrl}/users/register`, user);

    return request.pipe(
      tap(() => {
        Swal.fire('¡Guardado!', 'El usuario ha sido procesado con éxito.', 'success');
      }),
      catchError((err) => {
        this.notifyError('No se pudo guardar el usuario.');
        return throwError(() => err);
      })
    );
  }

  changePassword(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/users/change-password`, data).pipe(
      tap(() => {
        Swal.fire('Éxito', 'Contraseña actualizada correctamente', 'success');
      }),
      catchError(err => {
        this.notifyError(err.error?.error || 'Error al cambiar la contraseña');
        return throwError(() => err);
      })
    );
  }

  // --- RESTO DE MÉTODOS (Getters) ---
  getRoles(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/roles`); }
  getTipoDocs(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/tipo-documentos`); }

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
      catchError(err => {
        this.notifyError('No se pudo actualizar el estado.');
        return throwError(() => err);
      })
    );
  }

  getMenuForRole(roleId: number): any[] {
    const menus: any = {
      1: [ { title: 'Dashboard', icon: 'fa-bar-chart', route: '/dashboard/admin/home' }, { title: 'Usuarios', icon: 'fa-users', route: '/dashboard/admin/users' } ],
      2: [ { title: 'Proyectos', icon: 'fa-briefcase', route: '/dashboard/coordinator/projects' } ],
      4: [ { title: 'Mis Tareas', icon: 'fa-calendar', route: '/dashboard/operator/calendar' } ]
    };
    return menus[roleId] || [];
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/users/forgot-password`, { email }).pipe(
      tap(() => Swal.fire('Enviado', 'Revisa tu correo electrónico', 'info'))
    );
  }

  resetPassword(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/users/reset-password`, data).pipe(
      tap(() => Swal.fire('Éxito', 'Ya puedes iniciar sesión con tu nueva clave', 'success'))
    );
  }
}