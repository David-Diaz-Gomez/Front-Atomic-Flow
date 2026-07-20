import { Injectable } from '@angular/core';
import {
  HttpRequest, HttpHandler, HttpEvent,
  HttpInterceptor, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, EMPTY } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { TokenRefreshService } from '../services/token-refresh.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshSubject = new BehaviorSubject<string | null>(null);

  constructor(private refreshSvc: TokenRefreshService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (this.isAuthEndpoint(req.url)) return next.handle(req);

    return next.handle(this.addToken(req)).pipe(
      catchError((err: HttpErrorResponse) =>
        err.status === 401 ? this.handle401(req, next) : throwError(() => err)
      )
    );
  }

  private addToken(req: HttpRequest<any>): HttpRequest<any> {
    const token = localStorage.getItem('token');
    return token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;
  }

  private isAuthEndpoint(url: string): boolean {
    return url.includes('/auth/refresh') || url.includes('/auth/login') || url.includes('/auth/operario');
  }

  private handle401(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (this.isRefreshing) {
      return this.refreshSubject.pipe(
        filter(t => t !== null),
        take(1),
        switchMap(t => next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${t}` } })))
      );
    }

    this.isRefreshing = true;
    this.refreshSubject.next(null);

    return this.refreshSvc.refresh().pipe(
      switchMap((res: any) => {
        const newToken: string = res?.data?.access_token ?? localStorage.getItem('token')!;
        this.isRefreshing = false;
        this.refreshSubject.next(newToken);
        return next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }));
      }),
      catchError(() => {
        this.isRefreshing = false;
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('currentUser');
        this.router.navigate(['/auth/login']);
        return EMPTY;
      })
    );
  }
}
