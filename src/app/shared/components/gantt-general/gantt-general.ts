import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../../core/services/api';

interface GGProject {
  id: number;
  nombre: string;
  codigo: string;
  cliente: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string;
  tiene_fases: boolean;
  expanded: boolean;
  fases: GGFase[];
  fasesLoading: boolean;
  total_tareas: number;
  tareas_completadas: number;
}

interface GGFase {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  tareas: GGTarea[];
  total_tareas: number;
  tareas_completadas: number;
}

interface GGTarea {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
}

const PX_PER_DAY = 4;
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const ESTADO_COLORS: Record<string,string> = {
  en_produccion: '#00A859', aprobado: '#3b82f6', en_revision: '#f59e0b',
  borrador: '#94a3b8', completado: '#6366f1', rechazado: '#ef4444',
};

@Component({
  selector: 'app-gantt-general',
  standalone: false,
  templateUrl: './gantt-general.html',
  styleUrl: './gantt-general.scss',
})
export class GanttGeneral implements OnInit {
  projects: GGProject[] = [];
  loading = true;
  error = '';

  ganttStart: Date = new Date();
  ganttEnd:   Date = new Date();
  ganttDays  = 0;
  ganttMonthHeaders: { label: string; width: number; left: number }[] = [];

  readonly pxPerDay = PX_PER_DAY;

  constructor(private api: Api, private cdr: ChangeDetectorRef, private router: Router) {}

  ngOnInit(): void { this.loadProjects(); }

  loadProjects(): void {
    this.loading = true;
    this.api.getVistaGeneralProyectos().subscribe({
      next: (data: any[]) => {
        const list = data ?? [];
        this.projects = list.map((p: any) => ({
          id: p.id, nombre: p.nombre, codigo: p.codigo ?? '',
          cliente: p.cliente ?? '',
          estado: p.estado ?? 'aprobado',
          fecha_inicio: (p.fecha_inicio ?? '').substring(0, 10),
          fecha_fin:    (p.fecha_fin    ?? '').substring(0, 10),
          tiene_fases: p.tiene_fases ?? true,
          total_tareas: Number(p.total_tareas ?? 0),
          tareas_completadas: Number(p.tareas_completadas ?? 0),
          expanded: false, fases: [], fasesLoading: false,
        }));
        this.buildGanttAxis();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.projects = [];
        this.error = 'No se pudieron cargar los proyectos.';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  buildGanttAxis(): void {
    if (!this.projects.length) return;
    const starts = this.projects.map(p => new Date(p.fecha_inicio).getTime()).filter(Boolean);
    const ends   = this.projects.map(p => new Date(p.fecha_fin).getTime()).filter(Boolean);
    if (!starts.length) return;

    this.ganttStart = new Date(Math.min(...starts));
    this.ganttEnd   = new Date(Math.max(...ends));
    this.ganttStart.setDate(1); // start of month
    this.ganttEnd.setDate(1);
    this.ganttEnd.setMonth(this.ganttEnd.getMonth() + 1); // end of month

    this.ganttDays = Math.ceil((this.ganttEnd.getTime() - this.ganttStart.getTime()) / 86400000);

    // Build month headers
    this.ganttMonthHeaders = [];
    const cur = new Date(this.ganttStart);
    while (cur < this.ganttEnd) {
      const left = Math.round((cur.getTime() - this.ganttStart.getTime()) / 86400000) * PX_PER_DAY;
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const days = Math.round((next.getTime() - cur.getTime()) / 86400000);
      this.ganttMonthHeaders.push({
        label: `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`,
        width: days * PX_PER_DAY,
        left,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  toggleExpand(p: GGProject): void {
    if (!p.tiene_fases) return;
    p.expanded = !p.expanded;
    if (p.expanded && !p.fases.length) this.loadFases(p);
    this.cdr.detectChanges();
  }

  loadFases(p: GGProject): void {
    p.fasesLoading = true;
    this.api.getProyectoFasesGantt(p.id).subscribe({
      next: (data: any[]) => {
        p.fases = (data ?? []).map((f: any) => ({
          id: f.id, nombre: f.nombre,
          fecha_inicio: (f.fecha_inicio ?? '').substring(0, 10),
          fecha_fin:    (f.fecha_fin    ?? '').substring(0, 10),
          total_tareas: Number(f.total_tareas ?? 0),
          tareas_completadas: Number(f.tareas_completadas ?? 0),
          tareas: (f.tareas ?? []).map((t: any) => ({
            id: t.id, nombre: t.nombre,
            fecha_inicio: (t.fecha_inicio ?? '').substring(0, 10),
            fecha_fin:    (t.fecha_fin    ?? '').substring(0, 10),
            estado: t.estado ?? 'pendiente',
          })),
        }));
        p.fasesLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        p.fases = [];
        p.fasesLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  goToGantt(proyectoId: number): void {
    this.router.navigate(['/dashboard/director/gantt'], { queryParams: { proyecto: proyectoId } });
  }

  getBarStyle(fecha_inicio: string, fecha_fin: string): Record<string, string> {
    const start  = new Date(fecha_inicio).getTime();
    const end    = new Date(fecha_fin).getTime();
    const gsTime = this.ganttStart.getTime();
    const left   = Math.max(0, Math.round((start - gsTime) / 86400000)) * PX_PER_DAY;
    const width  = Math.max(4, Math.round((end - start) / 86400000) + 1) * PX_PER_DAY;
    return { left: `${left}px`, width: `${width}px` };
  }

  getEstadoColor(estado: string): string { return ESTADO_COLORS[estado] ?? '#94a3b8'; }

  getEstadoLabel(e: string): string {
    return ({ en_produccion:'En Producción', aprobado:'Aprobado', en_revision:'En Revisión',
              borrador:'Borrador', completado:'Completado', rechazado:'Rechazado' })[e] ?? e;
  }

  get ganttWidth(): number { return this.ganttDays * PX_PER_DAY; }

  getTareaBarClass(estado: string): string {
    return ({ completada:'t-done', en_progreso:'t-progress', asignada:'t-assigned', pendiente:'t-pending' })[estado] ?? 't-pending';
  }

  pct(completadas: number, total: number): number {
    if (!total) return 0;
    return Math.round((completadas / total) * 100);
  }

  dateLeft(dateStr: string): number {
    if (!dateStr) return -1;
    const t = new Date(dateStr).getTime();
    const gs = this.ganttStart.getTime();
    return Math.round((t - gs) / 86400000) * PX_PER_DAY;
  }

  formatDateShort(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split(/[-T]/);
    const m = parseInt(parts[1] ?? '1', 10) - 1;
    const d = parseInt(parts[2] ?? '1', 10);
    return `${d} ${MONTHS[m]}`;
  }

  /** Genera las líneas verticales únicas de inicio y fin de todos los proyectos */
  get projectDateLines(): { left: number; label: string; tipo: 'start' | 'end' }[] {
    const seen = new Set<number>();
    const lines: { left: number; label: string; tipo: 'start' | 'end' }[] = [];
    for (const p of this.projects) {
      const ls = this.dateLeft(p.fecha_inicio);
      const le = this.dateLeft(p.fecha_fin);
      if (ls >= 0 && !seen.has(ls)) { seen.add(ls); lines.push({ left: ls, label: this.formatDateShort(p.fecha_inicio), tipo: 'start' }); }
      if (le >= 0 && !seen.has(le)) { seen.add(le); lines.push({ left: le, label: this.formatDateShort(p.fecha_fin), tipo: 'end' }); }
    }
    return lines;
  }
}
