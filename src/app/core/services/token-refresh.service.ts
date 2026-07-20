import { Injectable } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// Usa HttpBackend para omitir el interceptor y evitar dependencia circular.
@Injectable({ providedIn: 'root' })
export class TokenRefreshService {
  private http: HttpClient;

  constructor(handler: HttpBackend) {
    this.http = new HttpClient(handler);
  }

  refresh(): Observable<any> {
    const refresh_token = localStorage.getItem('refresh_token');
    return this.http
      .post<any>(`${environment.apiUrl}/auth/refresh`, { refresh_token })
      .pipe(
        tap((res: any) => {
          if (res?.data?.access_token) {
            localStorage.setItem('token', res.data.access_token);
          }
        })
      );
  }
}
