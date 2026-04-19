import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { delay, tap, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class Api {
  private baseUrl = 'http://localhost:3000/api'; 

  constructor(private http: HttpClient) { }

  getRoles(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/roles`); }
  getTipoDocs(): Observable<any[]> { return this.http.get<any[]>(`${this.baseUrl}/tipo-documentos`); }

  // 🚀 CORRECCIÓN CRÍTICA: Ahora enviamos TODO lo que el componente pida
  getUsers(filters: any = {}): Observable<any> {
    let params = new HttpParams();

    // Recorremos los filtros dinámicamente
    Object.keys(filters).forEach(key => {
      const value = filters[key];
      // Si el valor no es nulo, indefinido o vacío, lo agregamos a la URL
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, value.toString());
      }
    });

    // Ahora la URL se verá así: /api/users?page=1&limit=5&search=david&role=1
    return this.http.get<any>(`${this.baseUrl}/users`, { params });
  }

  saveUser(user: any): Observable<any> {
    if (user.ID) {
      return this.http.put(`${this.baseUrl}/users/${user.ID}`, user);
    } else {
      return this.http.post(`${this.baseUrl}/users/register`, user);
    }
  }
 updateStatus(id: number, status: number): Observable<any> {
  // El backend espera el campo "estado" en el body (según tu service)
  return this.http.patch(`${this.baseUrl}/users/${id}/status`, { estado: status });
}
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
          return { success: true, user: userData };
        }
        return { success: false, message: 'Credenciales inválidas' };
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


changePassword(data: any): Observable<any> {
  return this.http.post(`${this.baseUrl}/users/change-password`, data);
}

forgotPassword(email: string): Observable<any> {
  // Consumimos el endpoint: POST /api/users/forgot-password
  return this.http.post(`${this.baseUrl}/users/forgot-password`, { email });
}

resetPassword(data: any): Observable<any> {
  // Consumimos el endpoint: POST /api/users/reset-password
  // data debe llevar { token, newPassword }
  return this.http.post(`${this.baseUrl}/users/reset-password`, data);
}


}