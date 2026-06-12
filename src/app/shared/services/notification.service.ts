import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Api } from '../../core/services/api';

export type NotifTipo =
  | 'asignacion' | 'tarea_completada' | 'evidencia' | 'evidencia_subida'
  | 'fase_completada' | 'proyecto_completado' | 'reasignacion'
  | 'comentario' | 'recordatorio' | 'fase_delegada' | 'sistema';

export interface AppNotif {
  id: number;
  titulo: string;
  mensaje: string;
  hora: string;
  leida: boolean;
  tipo: NotifTipo;
  tarea_id?: number;
  proyecto_id?: number;
  fase_id?: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private _notifs: AppNotif[] = [];
  private _unread  = 0;
  private _timer: any = null;
  private _es: EventSource | null = null;

  get notifs():      AppNotif[] { return this._notifs; }
  get unreadCount(): number     { return this._unread;  }

  constructor(private http: HttpClient, private api: Api, @Inject(PLATFORM_ID) private pid: object) {
    if (!isPlatformBrowser(this.pid)) return;
    this.loadNotifs();
    // Polling como respaldo por si el SSE se cae o el navegador lo cierra
    this._timer = setInterval(() => this.loadNotifs(), 60_000);
    this.connectStream();
  }

  ngOnDestroy(): void {
    this._es?.close();
    if (this._timer) clearInterval(this._timer);
  }

  /** Cierra el stream SSE (llamar al cerrar sesión). */
  disconnect(): void {
    this._es?.close();
    this._es = null;
  }

  /** Reconecta el stream SSE con el token actual (llamar tras iniciar sesión). */
  reconnect(): void {
    if (!isPlatformBrowser(this.pid)) return;
    this.loadNotifs();
    this.connectStream();
  }

  /** Conecta al stream SSE de notificaciones para recibir push inmediato. */
  private connectStream(): void {
    const token = this.api.getToken();
    if (!token) return;
    this._es?.close();
    this._es = new EventSource(`${this.api.baseUrl}/notificaciones/stream?token=${encodeURIComponent(token)}`);
    this._es.addEventListener('notificacion', (e: MessageEvent) => {
      try {
        const n = JSON.parse(e.data);
        const mapped = this.map(n);
        if (!this._notifs.some(x => x.id === mapped.id)) {
          this._notifs.unshift(mapped);
          if (!mapped.leida) this._unread++;
        }
      } catch { /* payload inesperado, ignorar */ }
    });
    this._es.onerror = () => {
      // EventSource reintenta solo; si el token cambió (refresh), reconectamos con el nuevo
      this._es?.close();
      this._es = null;
      setTimeout(() => this.connectStream(), 5_000);
    };
  }

  loadNotifs(): void {
    const uid = this.api.getCurrentUserId();
    if (!uid) return;
    this.http.get<any>(`${this.api.baseUrl}/notificaciones?page=1&limit=30`).subscribe({
      next: (r: any) => {
        const data: any[] = r?.data ?? [];
        this._notifs = data.map(n => this.map(n));
        this._unread  = r?.no_leidas ?? data.filter((n: any) => !n.leida).length;
      },
      error: () => { /* mantiene estado anterior */ },
    });
  }

  private map(n: any): AppNotif {
    return {
      id:          n.id,
      titulo:      n.titulo,
      mensaje:     n.cuerpo ?? n.mensaje ?? '',
      hora:        this.relTime(n.creado_en ?? n.hora ?? ''),
      leida:       !!n.leida,
      tipo:        n.tipo as NotifTipo,
      tarea_id:    n.tarea_id,
      proyecto_id: n.proyecto_id,
      fase_id:     n.fase_id,
    };
  }

  private relTime(iso: string): string {
    if (!iso) return '';
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1)   return 'Ahora mismo';
    if (diff < 60)  return `Hace ${diff} min`;
    const h = Math.round(diff / 60);
    if (h < 24)     return `Hace ${h} h`;
    return `Hace ${Math.round(h / 24)} día(s)`;
  }

  markRead(id: number): void {
    const n = this._notifs.find(x => x.id === id);
    if (!n || n.leida) return;
    n.leida = true;
    this._unread = Math.max(0, this._unread - 1);
    this.http.patch(`${this.api.baseUrl}/notificaciones/${id}/leer`, {}).subscribe({ error: () => {} });
  }

  markAllRead(): void {
    this._notifs.forEach(n => (n.leida = true));
    this._unread = 0;
    this.http.patch(`${this.api.baseUrl}/notificaciones/leer-todas`, {}).subscribe({ error: () => {} });
  }

  /** Agrega una notificación local (mientras no llega del backend por polling). */
  add(notif: Omit<AppNotif, 'id' | 'leida'>): void {
    this._notifs.unshift({ ...notif, id: Date.now(), leida: false });
    this._unread++;
  }
}
