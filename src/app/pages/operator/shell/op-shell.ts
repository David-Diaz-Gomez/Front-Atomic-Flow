import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NotificationService } from '../../../shared/services/notification.service';

@Component({
  selector: 'app-op-shell',
  standalone: false,
  templateUrl: './op-shell.html',
  styleUrl: './op-shell.scss',
})
export class OpShell implements OnInit {
  userName = '';
  activeRoute = '';

  constructor(private router: Router, private notifSvc: NotificationService) {}

  get unreadNotifs(): number { return this.notifSvc.unreadCount; }

  ngOnInit(): void {
    try {
      const u = JSON.parse(localStorage.getItem('currentUser') ?? 'null');
      this.userName = u?.name ?? 'Operario';
    } catch { this.userName = 'Operario'; }

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => { this.activeRoute = e.urlAfterRedirects; });
    this.activeRoute = this.router.url;
  }

  isActive(seg: string): boolean { return this.activeRoute.includes(seg); }

  go(path: string): void { this.router.navigate(['/dashboard/operator/' + path]); }

  logout(): void {
    this.notifSvc.disconnect();
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    this.router.navigate(['/auth/login']);
  }

  get firstName(): string {
    return this.userName.split(' ')[0] ?? 'Operario';
  }
}
