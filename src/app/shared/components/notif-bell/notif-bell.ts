import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService, AppNotif } from '../../services/notification.service';

@Component({
  selector: 'app-notif-bell',
  standalone: false,
  templateUrl: './notif-bell.html',
  styleUrl: './notif-bell.scss',
})
export class NotifBellComponent {
  showPanel = false;

  constructor(public notifSvc: NotificationService, private router: Router) {}

  toggle(): void { this.showPanel = !this.showPanel; }

  markAll(): void { this.notifSvc.markAllRead(); this.showPanel = false; }

  onClick(n: AppNotif): void {
    this.notifSvc.markRead(n.id);
    this.showPanel = false;
    const routes: Record<string, string> = {
      tarea_completada:    '/dashboard/coordinator/evidences',
      evidencia_subida:    '/dashboard/director/evidencias',
      fase_completada:     '/dashboard/director/home',
      proyecto_completado: '/dashboard/admin/home',
      asignacion:          '/dashboard/superoperario/home',
      reasignacion:        '/dashboard/superoperario/home',
      recordatorio:        '/dashboard/superoperario/home',
      comentario:          '/dashboard/superoperario/home',
    };
    const route = routes[n.tipo];
    if (route) void this.router.navigateByUrl(route);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.notif-bell-wrap')) this.showPanel = false;
  }

  iconFor(tipo: string): string {
    const map: Record<string, string> = {
      tarea_completada:    'fa-check-circle',
      evidencia_subida:    'fa-camera',
      fase_completada:     'fa-flag-checkered',
      proyecto_completado: 'fa-trophy',
      asignacion:          'fa-user-plus',
      reasignacion:        'fa-refresh',
      comentario:          'fa-comment',
      recordatorio:        'fa-clock-o',
      fase_delegada:       'fa-share-square-o',
      sistema:             'fa-bell-o',
    };
    return map[tipo] ?? 'fa-bell-o';
  }
}
