import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, Subscription, interval } from 'rxjs';
import { Api } from '../../../core/services/api';

const REFRESH_MS = 30_000;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-op-home',
  standalone: false,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class OpHome implements OnInit, OnDestroy {
  readonly today = new Date();
  readonly todayStr = this.today.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  tasksToday: any[] = [];
  upcoming: any[] = [];

  private refreshSub: Subscription | null = null;

  get kpi() {
    const hoy = this.tasksToday;
    const totalH = hoy.reduce((s, t) => {
      const [ih, im] = t.hora_inicio.split(':').map(Number);
      const [fh, fm] = t.hora_fin.split(':').map(Number);
      return s + (fh + fm/60) - (ih + im/60);
    }, 0);
    return {
      tareas_hoy:      hoy.length,
      horas_hoy:       Math.round(totalH),
      en_progreso:     hoy.filter(t => t.estado === 'en_progreso').length,
      asignadas:       hoy.filter(t => t.estado === 'asignada' || t.estado === 'pendiente').length,
      evidencias_pend: hoy.reduce((s, t) => s + (t.evidencias_pendientes ?? 0), 0),
    };
  }

  constructor(private router: Router, private api: Api, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadAll();
    this.refreshSub = interval(REFRESH_MS).subscribe(() => this.loadAll());
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  loadAll(): void {
    const idOp = this.api.getCurrentUserId() ?? undefined;
    const todayKey = toDateKey(this.today);

    this.api.getSuperOpTareas(todayKey, idOp).subscribe({
      next: (d: any[]) => { this.tasksToday = (d ?? []).map(t => this.normalize(t, todayKey)); this.cdr.detectChanges(); },
      error: () => { this.tasksToday = []; this.cdr.detectChanges(); },
    });

    const upcomingDays = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(this.today);
      d.setDate(d.getDate() + i + 1);
      return toDateKey(d);
    });
    forkJoin(upcomingDays.map(key => this.api.getSuperOpTareas(key, idOp))).subscribe({
      next: (results: any[][]) => {
        this.upcoming = results
          .flatMap((tasks, i) => (tasks ?? []).map(t => this.normalize(t, upcomingDays[i])))
          .filter(t => t.estado !== 'completada')
          .slice(0, 5);
        this.cdr.detectChanges();
      },
      error: () => { this.upcoming = []; this.cdr.detectChanges(); },
    });
  }

  private normalize(t: any, fecha: string): any {
    return {
      id: t.id,
      nombre: t.nombre,
      fase: t.fase ?? '',
      proyecto: t.proyecto ?? '',
      proyecto_id: t.proyecto_id ?? t.id_proyecto ?? null,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      estado: t.estado,
      tipo_tarea: t.tipo_tarea ?? '',
      evidencias_pendientes: t.evidencias_pendientes ?? 0,
      comentario_coordinador: t.comentario_coordinador ?? t.comentario ?? '',
      fecha,
    };
  }

  goTask(id: number): void  { this.router.navigate(['/dashboard/operator/task', id]); }
  goCalendar(): void        { this.router.navigate(['/dashboard/operator/calendar']); }
  goNotifs(): void          { this.router.navigate(['/dashboard/operator/notifications']); }

  estadoLabel(e: string): string {
    const m: Record<string, string> = { pendiente: 'Pendiente', asignada: 'Asignada', en_progreso: 'En Progreso', completada: 'Completada', en_revision: 'En Revisión' };
    return m[e] ?? e;
  }

  estadoBadge(e: string): string {
    return `badge-${e}`;
  }

  getDay(d: string): string {
    if (!d) return '';
    return String(parseInt(d.split('-')[2] ?? '1', 10));
  }

  getMon(d: string): string {
    if (!d) return '';
    const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return meses[parseInt(d.split('-')[1] ?? '1', 10)] ?? '';
  }
}
