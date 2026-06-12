import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ProjectService } from '../../../shared/services/project.service';
import { Api } from '../../../core/services/api';

interface DiaBloque { nombre: string; proyecto_id: number; proyecto: string; hora_inicio: string | number; hora_fin: string | number; horas?: number; }
interface DiaData   { fecha: string; horas_ocupadas: number; bloques: DiaBloque[]; }
interface GanttProject { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; fases: any[]; }

const MONTHS     = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const PHASE_COLORS = ['#8DC63F','#00A859','#E6E13C','#8fb3b3','#e67e22','#9b59b6','#3498db'];
const COLOR_POOL   = ['#2196F3','#4CAF50','#FF9800','#9C27B0','#F44336','#00BCD4'];
const BAR_CLASSES: Record<string, string> = {
  completada:'bar-done', en_progreso:'bar-progress', asignada:'bar-assigned', pendiente:'bar-pending', bloqueada:'bar-blocked',
};

@Component({ selector: 'app-coord-gantt', standalone: false, templateUrl: './gantt.html', styleUrl: './gantt.scss' })
export class CoordGantt implements OnInit {
  projects: GanttProject[] = [];
  selectedProjectId: number | null = null;
  loading = true;
  error = '';

  ganttDays: Date[] = [];
  readonly cellWidth = 36;

  calendarWeekStart: Date = new Date();
  calendarDays: Date[]    = [];

  weeklyOcc:          any[] = [];
  weeklyOperariosOcc: any[] = [];
  projectColorMap = new Map<number, string>();
  muebleMarkers: { id: number; nombre: string; fecha_fin: string }[] = [];

  // Recursos (nombres) asignados a tareas del proyecto seleccionado
  projectOpNames:  string[] = [];
  projectMaqNames: string[] = [];

  showPanel = false;
  panelTask: any = null;
  panelFase = '';
  panelDays: Date[] = [];

  get selectedProject(): GanttProject | undefined { return this.projects.find(p => p.id === this.selectedProjectId); }

  constructor(
    private router:     Router,
    private projectSvc: ProjectService,
    private apiSvc:     Api,
    private cdr:        ChangeDetectorRef,
    @Inject(PLATFORM_ID) private pid: object,
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.pid)) {
      this.calendarWeekStart = this.startOfWeek(new Date());
      this.buildCalendarWeek();
      this.loadProjects();
    }
  }

  loadProjects(): void {
    this.loading = true;
    const userId = this.apiSvc.getCurrentUserId();
    const filters: Record<string, any> = { limit: 50 };
    if (userId) filters['coordinador'] = userId;

    this.projectSvc.getProjects(filters).subscribe({
      next: ({ data }) => {
        const approved = data.filter((p: any) => Number(p.aprobado) === 1 || p.estado === 'aprobado' || p.estado === 'en_produccion');
        if (!approved.length) { this.loading = false; this.error = 'No hay proyectos aprobados.'; this.cdr.detectChanges(); return; }
        this.projects = approved.map((p: any) => ({ id: Number(p.id), nombre: p.nombre, fecha_inicio: p.fecha_inicio ?? '', fecha_fin: p.fecha_fin ?? '', fases: [] }));
        this.selectedProjectId = this.projects[0]?.id ?? null;
        if (this.selectedProjectId) this.loadProjectFull(this.selectedProjectId);
        else { this.loading = false; this.cdr.detectChanges(); }
      },
      error: () => { this.error = 'No se pudieron cargar los proyectos.'; this.loading = false; this.cdr.detectChanges(); },
    });
  }

  loadProjectFull(id: number): void {
    this.loading = true;
    this.projectSvc.getProjectFull(id).subscribe({
      next: full => {
        const fases = (full.fases ?? []).map((f: any, fi: number) => ({
          id: Number(f.id), nombre: f.nombre, color: PHASE_COLORS[fi % PHASE_COLORS.length],
          fecha_inicio: String(f.fecha_inicio ?? '').substring(0, 10),
          fecha_fin:    String(f.fecha_fin    ?? '').substring(0, 10),
          tareas: (f.tareas ?? []).map((t: any) => ({
            id: t.id, nombre: t.nombre ?? '', estado: t.estado ?? 'pendiente',
            fecha_inicio: (t.fecha_inicio ?? '').substring(0, 10),
            fecha_fin:    (t.fecha_fin    ?? '').substring(0, 10),
            operarios:   (t.operarios   ?? []).map((o: any) => typeof o === 'string' ? o : `${o.nombre ?? ''} ${o.apellido ?? ''}`.trim()),
            maquinarias: (t.maquinarias ?? []).map((m: any) => typeof m === 'string' ? m : (m.nombre ?? '')),
          })),
        }));
        const idx = this.projects.findIndex(p => p.id === id);
        if (idx >= 0) this.projects[idx] = { ...this.projects[idx], fecha_inicio: String(full.fecha_inicio ?? '').substring(0, 10), fecha_fin: String(full.fecha_fin ?? '').substring(0, 10), fases };
        this.buildGanttDays();

        // Extraer operarios y máquinas únicas del proyecto para filtrar el calendario
        const opSet = new Set<string>(), maqSet = new Set<string>();
        for (const f of fases) {
          for (const t of f.tareas) {
            (t.operarios   ?? []).forEach((n: string) => { if (n) opSet.add(n); });
            (t.maquinarias ?? []).forEach((n: string) => { if (n) maqSet.add(n); });
          }
        }
        this.projectOpNames  = [...opSet];
        this.projectMaqNames = [...maqSet];

        // Saltar el calendario a la semana del inicio del proyecto
        const fi = String(full.fecha_inicio ?? '').substring(0, 10);
        if (fi) {
          this.calendarWeekStart = this.startOfWeek(new Date(fi + 'T00:00:00'));
          this.buildCalendarWeek();
        }

        this.loading = false;
        this.loadMuebleMarkers(id);
        this.cdr.detectChanges();
      },
      error: () => { this.error = 'No se pudo cargar el proyecto.'; this.loading = false; this.cdr.detectChanges(); },
    });
  }

  loadMuebleMarkers(projectId: number): void {
    this.projectSvc.getProjectMuebles(projectId).subscribe({
      next: muebles => {
        this.muebleMarkers = muebles.map((m: any) => ({
          id: m.id, nombre: m.nombre,
          fecha_fin: String(m.fecha_fin ?? '').substring(0, 10),
        }));
        this.cdr.detectChanges();
      },
      error: () => { this.muebleMarkers = []; },
    });
  }

  selectProject(id: number | string): void {
    this.selectedProjectId = Number(id); this.showPanel = false;
    this.loadProjectFull(this.selectedProjectId);
  }

  // ── Gantt ─────────────────────────────────────────────────────────────────
  buildGanttDays(): void {
    const p = this.selectedProject; if (!p?.fecha_inicio) return;
    this.ganttDays = [];
    const cur = new Date(p.fecha_inicio), end = new Date(p.fecha_fin);
    while (cur <= end) { this.ganttDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  }

  getBarStyle(row: { fecha_inicio: string; fecha_fin: string }): Record<string, string> {
    const p = this.selectedProject;
    if (!p || !this.ganttDays.length) return { display: 'none' };
    const ps = new Date(p.fecha_inicio).getTime();
    const rs = new Date(row.fecha_inicio).getTime(), re = new Date(row.fecha_fin).getTime();
    const off = Math.round((rs - ps) / 86400000), w = Math.round((re - rs) / 86400000) + 1;
    if (off < 0 || w <= 0) return { display: 'none' };
    return { left: `${off * this.cellWidth}px`, width: `${w * this.cellWidth - 4}px` };
  }
  getBarClass(estado: string): string { return BAR_CLASSES[estado] ?? 'bar-pending'; }

  // ── Panel de tarea ────────────────────────────────────────────────────────
  openPanel(task: any, faseName: string): void {
    this.panelTask = task; this.panelFase = faseName; this.showPanel = true;
    this.panelDays = [];
    const s = new Date(task.fecha_inicio + 'T00:00:00'), e = new Date(task.fecha_fin + 'T00:00:00'), cur = new Date(s);
    while (cur <= e && this.panelDays.length < 7) { this.panelDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    // Jump calendar to task's week so occupancy is visible immediately
    this.calendarWeekStart = this.startOfWeek(s);
    this.buildCalendarWeek();
  }
  closePanel(): void { this.showPanel = false; this.panelTask = null; }

  // ── Semana calendar ───────────────────────────────────────────────────────
  buildCalendarWeek(): void {
    this.calendarDays = [];
    for (let i = 0; i < 7; i++) { const d = new Date(this.calendarWeekStart); d.setDate(d.getDate() + i); this.calendarDays.push(d); }
    this.loadWeeklyOccupancy();
  }

  loadWeeklyOccupancy(): void {
    const desde = this.toStr(this.calendarWeekStart);
    const endDay = new Date(this.calendarWeekStart); endDay.setDate(endDay.getDate() + 6);
    const hasta  = this.toStr(endDay);
    forkJoin({
      maquinas:  this.projectSvc.getMachineryWeeklyOccupancy(desde, hasta, null).pipe(catchError(() => of([]))),
      operarios: this.projectSvc.getOperarioOccupancy(desde, hasta).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ maquinas, operarios }) => {
        this.weeklyOcc          = Array.isArray(maquinas) ? maquinas : ((maquinas as any)?.data ?? []);
        this.weeklyOperariosOcc = Array.isArray(operarios) ? operarios : ((operarios as any)?.data ?? []);
        this.buildProjectColorMap([...this.weeklyOcc, ...this.weeklyOperariosOcc]);
        this.cdr.detectChanges();
      },
    });
  }

  prevWeek(): void { const d = new Date(this.calendarWeekStart); d.setDate(d.getDate() - 7); this.calendarWeekStart = d; this.buildCalendarWeek(); }
  nextWeek(): void { const d = new Date(this.calendarWeekStart); d.setDate(d.getDate() + 7); this.calendarWeekStart = d; this.buildCalendarWeek(); }

  // ── Ocupación (mismo lógica que director) ─────────────────────────────────
  getDayData(resource: any, day: Date): DiaData | null {
    const dateStr = this.toStr(day);
    const dias = resource.dias;
    if (!dias) return null;
    if (Array.isArray(dias)) {
      const found = dias.find((d: any) => d.fecha === dateStr);
      if (!found) return null;
      const items: any[] = found.bloques ?? found.tareas ?? [];
      if (!items.length) return null;
      return {
        fecha: found.fecha, horas_ocupadas: found.horas_ocupadas ?? 0,
        bloques: items.map((b: any) => ({
          nombre: b.nombre ?? '', proyecto_id: b.proyecto_id ?? 0, proyecto: b.proyecto ?? '',
          hora_inicio: this.formatHora(b.hora_inicio ?? 7), hora_fin: this.formatHora(b.hora_fin ?? 18),
          horas: b.horas ?? ((typeof b.hora_fin === 'number' ? b.hora_fin : this.timeToDecimal(b.hora_fin)) - (typeof b.hora_inicio === 'number' ? b.hora_inicio : this.timeToDecimal(b.hora_inicio))),
        })),
      };
    }
    const blocks: any[] = dias[dateStr];
    if (!blocks?.length) return null;
    return { fecha: dateStr, horas_ocupadas: blocks.reduce((s: number, b: any) => s + ((b.hora_fin ?? 18) - (b.hora_inicio ?? 7)), 0),
      bloques: blocks.map((b: any) => ({ nombre: b.tarea ?? b.nombre ?? '', proyecto_id: b.proyecto_id ?? 0, proyecto: b.proyecto ?? '', hora_inicio: this.formatHora(b.hora_inicio ?? 7), hora_fin: this.formatHora(b.hora_fin ?? 18), horas: (b.hora_fin ?? 18) - (b.hora_inicio ?? 7) })) };
  }

  getBloqueStyle(b: DiaBloque, color: string): Record<string, string> {
    const left  = ((this.timeToDecimal(b.hora_inicio) - 7) / 11) * 100;
    const width = ((this.timeToDecimal(b.hora_fin) - this.timeToDecimal(b.hora_inicio)) / 11) * 100;
    return { position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%', background: color, borderRadius: '3px' };
  }

  calcDayPct(d: DiaData): number { return Math.min(100, Math.round((d.horas_ocupadas / 11) * 100)); }

  buildDayTooltip(d: DiaData): string {
    return (d.bloques ?? []).map(b => `${b.proyecto} · ${b.nombre} (${b.hora_inicio}–${b.hora_fin})`).join('\n─────\n');
  }

  getDayTooltip(resource: any, day: Date): string {
    const d = this.getDayData(resource, day); return d ? this.buildDayTooltip(d) : '';
  }

  getCeldaBg(resource: any, day: Date): string {
    const d = this.getDayData(resource, day);
    if (!d?.bloques?.length) return '';
    return this.getProjectColor(d.bloques[0].proyecto_id) + '26';
  }

  getProjectColor(id: number): string {
    if (!this.projectColorMap.has(id)) { this.projectColorMap.set(id, COLOR_POOL[this.projectColorMap.size % COLOR_POOL.length]); }
    return this.projectColorMap.get(id)!;
  }

  private buildProjectColorMap(resources: any[]): void {
    if (!Array.isArray(resources)) return;
    this.projectColorMap.clear();
    for (const res of resources) {
      for (const dia of (res.dias ?? [])) {
        for (const b of (dia.bloques ?? dia.tareas ?? [])) {
          if (b.proyecto_id != null) this.getProjectColor(b.proyecto_id);
        }
      }
    }
  }

  // Filtra la ocupación global a sólo los recursos del proyecto activo.
  // Si un recurso del proyecto no tiene bloques esa semana, aparece como fila vacía.
  get filteredMaqOcc(): any[] {
    if (!this.projectMaqNames.length) return this.weeklyOcc;
    const fromApi = this.weeklyOcc.filter(m => this.projectMaqNames.some(n => this.matchNombre(m.nombre, n)));
    const inApi = new Set(fromApi.map((m: any) => m.nombre));
    const empty = this.projectMaqNames.filter(n => !inApi.has(n)).map(n => ({ nombre: n, dias: [] }));
    return [...fromApi, ...empty];
  }

  get filteredOpOcc(): any[] {
    if (!this.projectOpNames.length) return this.weeklyOperariosOcc;
    const fromApi = this.weeklyOperariosOcc.filter(o => {
      const name = o.nombre_completo || `${o.nombre ?? ''} ${o.apellido ?? ''}`.trim();
      return this.projectOpNames.some(n => this.matchNombre(name, n));
    });
    const inApi = new Set(fromApi.map((o: any) => (o.nombre_completo || `${o.nombre ?? ''} ${o.apellido ?? ''}`.trim()).toLowerCase()));
    const empty = this.projectOpNames
      .filter(n => !inApi.has(n.toLowerCase()))
      .map(n => ({ nombre_completo: n, dias: [] }));
    return [...fromApi, ...empty];
  }

  private matchNombre(a: string, b: string): boolean {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  }

  get projectColorLegend(): { nombre: string; color: string }[] {
    const legend: { nombre: string; color: string }[] = [];
    this.projectColorMap.forEach((color, id) => {
      let nombre = `Proyecto ${id}`;
      outer: for (const res of [...this.weeklyOcc, ...this.weeklyOperariosOcc]) {
        for (const dia of (res.dias ?? [])) {
          for (const b of (dia.bloques ?? dia.tareas ?? [])) {
            if (b.proyecto_id === id) { nombre = b.proyecto; break outer; }
          }
        }
      }
      legend.push({ nombre, color });
    });
    return legend;
  }

  isInProjectRange(day: Date): boolean {
    const p = this.selectedProject; if (!p?.fecha_inicio) return false;
    const s = this.toStr(day); return s >= p.fecha_inicio && s <= p.fecha_fin;
  }

  // ── Utils ──────────────────────────────────────────────────────────────────
  private startOfWeek(d: Date): Date {
    const day = new Date(d); const diff = day.getDay() === 0 ? -6 : 1 - day.getDay();
    day.setDate(day.getDate() + diff); return day;
  }

  timeToDecimal(t: number | string): number {
    if (typeof t === 'number') return t;
    const [h, m] = String(t).split(':').map(Number); return h + (m || 0) / 60;
  }
  formatHora(t: number | string): string {
    if (typeof t === 'number') return `${String(t).padStart(2, '0')}:00`;
    return String(t).substring(0, 5);
  }

  isTodayMarker(d: Date): boolean { const t = new Date(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); }
  isWeekend(d: Date): boolean { return d.getDay() === 0; }
  toStr(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  dayLabel(d: Date): string   { return String(d.getDate()); }
  monthLabel(d: Date): string { return MONTHS[d.getMonth()] ?? ''; }
  weekDayLabel(d: Date): string { return DAYS_SHORT[d.getDay()] ?? ''; }
  panelDayLabel(d: Date): string { return `${DAYS_SHORT[d.getDay()]??''} ${d.getDate()} ${this.monthLabel(d)}`; }

  estadoLabel(e: string): string {
    const l: Record<string,string> = { completada:'Completada', en_progreso:'En Progreso', asignada:'Asignada', pendiente:'Pendiente' };
    return l[e] ?? e;
  }
  estadoBadge(e: string): string {
    const m: Record<string,string> = { completada:'tbadge-done', en_progreso:'tbadge-progress', asignada:'tbadge-assigned', pendiente:'tbadge-pending' };
    return m[e] ?? 'tbadge-pending';
  }

  markerLeft(fecha_fin: string): number | null {
    const p = this.selectedProject;
    if (!p?.fecha_inicio || !this.ganttDays.length) return null;
    const ps  = new Date(p.fecha_inicio + 'T00:00:00').getTime();
    const mft = new Date(fecha_fin + 'T00:00:00').getTime();
    const off = Math.round((mft - ps) / 86400000);
    if (off < 0 || off >= this.ganttDays.length) return null;
    return off * this.cellWidth + this.cellWidth / 2;
  }

  get ganttWidth(): number { return this.ganttDays.length * this.cellWidth; }
  get calendarWeekLabel(): string {
    const end = new Date(this.calendarWeekStart); end.setDate(end.getDate() + 6);
    return `${this.dayLabel(this.calendarWeekStart)} ${this.monthLabel(this.calendarWeekStart)} — ${this.dayLabel(end)} ${this.monthLabel(end)} ${end.getFullYear()}`;
  }

  goToProject(id: number | null): void { if (id) this.router.navigate(['/dashboard/coordinator/project', id]); }
  goBack(): void { this.router.navigate(['/dashboard/coordinator/home']); }
}
