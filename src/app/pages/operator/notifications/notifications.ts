import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService, AppNotif, NotifTipo } from '../../../shared/services/notification.service';

@Component({
  selector: 'app-op-notifications',
  standalone: false,
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
})
export class OpNotifications {
  filterTipo = '';

  constructor(private notifSvc: NotificationService, private router: Router) {}

  get notifs(): AppNotif[] { return this.notifSvc.notifs; }
  get unread(): number { return this.notifSvc.unreadCount; }

  get filtradas(): AppNotif[] {
    return this.notifs.filter(n => !this.filterTipo || n.tipo === this.filterTipo);
  }

  markAll(): void { this.notifSvc.markAllRead(); }

  open(n: AppNotif): void {
    this.notifSvc.markRead(n.id);
    if (n.tarea_id) this.router.navigate(['/dashboard/operator/task', n.tarea_id]);
  }

  tipoIcon(tipo: NotifTipo): string {
    const m: Record<string, string> = {
      asignacion:          'fa-user-plus',
      reasignacion:        'fa-refresh',
      tarea_completada:    'fa-check-circle',
      evidencia:           'fa-camera',
      evidencia_subida:    'fa-camera',
      fase_completada:     'fa-flag-checkered',
      proyecto_completado: 'fa-trophy',
      comentario:          'fa-comment',
      recordatorio:        'fa-clock-o',
      fase_delegada:       'fa-share-square-o',
      sistema:             'fa-bell-o',
    };
    return m[tipo] ?? 'fa-bell-o';
  }

  tipoColor(tipo: NotifTipo): string {
    const m: Record<string, string> = {
      asignacion:          '#3b82f6',
      reasignacion:        '#f59e0b',
      tarea_completada:    '#00A859',
      evidencia:           '#8b5cf6',
      evidencia_subida:    '#8b5cf6',
      fase_completada:     '#00A859',
      proyecto_completado: '#00A859',
      comentario:          '#8b5cf6',
      recordatorio:        '#f59e0b',
      fase_delegada:       '#0891b2',
      sistema:             '#64748b',
    };
    return m[tipo] ?? '#64748b';
  }

  tipoLabel(tipo: NotifTipo): string {
    const m: Record<string, string> = {
      asignacion:          'Asignación',
      reasignacion:        'Reasignación',
      tarea_completada:    'Tarea completada',
      evidencia:           'Evidencia',
      evidencia_subida:    'Evidencia',
      fase_completada:     'Fase completada',
      proyecto_completado: 'Proyecto completado',
      comentario:          'Comentario',
      recordatorio:        'Recordatorio',
      fase_delegada:       'Fase delegada',
      sistema:             'Sistema',
    };
    return m[tipo] ?? tipo;
  }
}
