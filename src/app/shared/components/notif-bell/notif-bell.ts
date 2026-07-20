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

  private get roleId(): number {
    try { return JSON.parse(localStorage.getItem('currentUser') ?? 'null')?.roleId ?? 0; }
    catch { return 0; }
  }

  onClick(n: AppNotif): void {
    this.notifSvc.markRead(n.id);
    this.showPanel = false;

    const pid = n.proyecto_id;
    const role = this.roleId;

    // Coordinator (3)
    if (role === 3) {
      if (['tarea_completada', 'tarea_en_revision', 'evidencia', 'evidencia_subida'].includes(n.tipo)) {
        void this.router.navigateByUrl('/dashboard/coordinator/evidences');
      } else if (['dependencia_resuelta', 'cambio_fechas', 'asignacion', 'reasignacion'].includes(n.tipo)) {
        void this.router.navigateByUrl(pid ? `/dashboard/coordinator/project/${pid}` : '/dashboard/coordinator/home');
      } else if (n.tipo === 'fase_delegada') {
        void this.router.navigateByUrl('/dashboard/coordinator/home');
      } else {
        void this.router.navigateByUrl('/dashboard/coordinator/home');
      }
      return;
    }

    // Director (2)
    if (role === 2) {
      if (['evidencia_subida', 'evidencia', 'tarea_completada', 'tarea_en_revision'].includes(n.tipo)) {
        void this.router.navigateByUrl(pid ? `/dashboard/director/project/${pid}` : '/dashboard/director/evidencias');
      } else if (n.tipo === 'fase_completada') {
        void this.router.navigateByUrl(pid ? `/dashboard/director/project/${pid}` : '/dashboard/director/home');
      } else if (n.tipo === 'proyecto_completado') {
        void this.router.navigateByUrl('/dashboard/director/home');
      } else {
        void this.router.navigateByUrl('/dashboard/director/home');
      }
      return;
    }

    // Admin (1)
    if (role === 1) { void this.router.navigateByUrl('/dashboard/admin/projects'); return; }

    // Operator / Superoperario (4/5) — fallback
    void this.router.navigateByUrl('/dashboard/superoperario/home');
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.notif-bell-wrap')) this.showPanel = false;
  }

  iconFor(tipo: string): string {
    const map: Record<string, string> = {
      tarea_completada:    'fa-check-circle',
      tarea_en_revision:   'fa-eye',
      evidencia_subida:    'fa-camera',
      evidencia:           'fa-camera',
      fase_completada:     'fa-flag-checkered',
      proyecto_completado: 'fa-trophy',
      asignacion:          'fa-user-plus',
      reasignacion:        'fa-refresh',
      comentario:          'fa-comment',
      recordatorio:        'fa-clock-o',
      fase_delegada:       'fa-share-square-o',
      dependencia_resuelta:'fa-unlock',
      cambio_fechas:       'fa-calendar-times-o',
      sistema:             'fa-bell-o',
    };
    return map[tipo] ?? 'fa-bell-o';
  }
}
