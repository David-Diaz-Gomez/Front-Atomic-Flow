import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { forkJoin, of, interval, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Api } from '../../../core/services/api';

const REFRESH_MS = 30_000;

interface Operario { id: number; nombre: string; apellido: string; correo: string; }

interface TareaKiosko {
  id: number; nombre: string; descripcion: string; instrucciones: string;
  fase: string; proyecto: string; hora_inicio: string; hora_fin: string;
  estado: string; completado_en: string | null; id_operario: number; operario: string;
}

interface LayoutItem { task: TareaKiosko; col: number; cols: number; }

const OP_COLORS = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#ec4899','#06b6d4'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function startOfWeek(d: Date): Date {
  const day = new Date(d);
  const diff = day.getDay() === 0 ? -6 : 1 - day.getDay();
  day.setDate(day.getDate() + diff);
  return day;
}

@Component({
  selector: 'app-superop-home',
  standalone: false,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class SuperOpHome implements OnInit, OnDestroy {
  view: 'calendar' | 'planner' | 'semana' = 'calendar';

  operarios: Operario[] = [];
  tareas: TareaKiosko[] = [];
  filteredTareas: TareaKiosko[] = [];

  selectedOperarioId: number | null = null;
  filterPassword = '';
  isFiltered = false;
  filterError = '';
  filteredOperario: Operario | null = null;
  isLoading = false;

  showTaskModal = false;
  selectedTarea: TareaKiosko | null = null;

  showInactivityModal = false;
  countdown = 30;

  // Week view
  weekOffset = 0;
  weekDays: Date[] = [];
  weekData: { [key: string]: TareaKiosko[] } = {};
  weekLoading = false;

  private inactivityTimeout: any = null;
  private countdownInterval: any = null;
  private readonly activityHandler = () => this.onActivity();
  private refreshSub: Subscription | null = null;

  readonly HOURS = [7,8,9,10,11,12,13,14,15,16,17,18];
  readonly DAY_H  = 11;
  readonly todayLabel = new Date().toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  private readonly todayKey = toDateKey(new Date());

  constructor(private api: Api, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadOperarios();
    this.loadTareas();
    this.buildWeek();
    this.refreshSub = interval(REFRESH_MS).subscribe(() => {
      this.loadTareas(this.isFiltered ? this.filteredOperario?.id : undefined);
      if (this.view === 'semana') this.loadWeekData();
    });
  }
  ngOnDestroy(): void { this.clearTimers(); this.removeListeners(); this.refreshSub?.unsubscribe(); }

  // ── Week navigation ───────────────────────────────────────────────────────

  buildWeek(): void {
    const base = startOfWeek(new Date());
    base.setDate(base.getDate() + this.weekOffset * 7);
    this.weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i); return d;
    });
  }

  switchView(v: 'calendar' | 'planner' | 'semana'): void {
    this.view = v;
    if (v === 'semana' && !Object.keys(this.weekData).length) this.loadWeekData();
    this.cdr.detectChanges();
  }

  prevWeek(): void { this.weekOffset--; this.buildWeek(); this.loadWeekData(); }
  nextWeek(): void { this.weekOffset++; this.buildWeek(); this.loadWeekData(); }

  loadWeekData(): void {
    this.weekLoading = true;
    const idOp = this.isFiltered ? this.filteredOperario?.id : undefined;
    const calls = this.weekDays.map(d => {
      const key = toDateKey(d);
      return this.api.getSuperOpTareas(key, idOp).pipe(
        map((data: any[]) => ({ key, tasks: data ?? [] })),
        catchError(() => of({ key, tasks: [] as TareaKiosko[] }))
      );
    });
    forkJoin(calls).subscribe({
      next: results => {
        this.weekData = {};
        results.forEach((r: any) => this.weekData[r.key] = r.tasks);
        this.weekLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.weekLoading = false; this.cdr.detectChanges(); },
    });
  }

  getDayTareas(d: Date): TareaKiosko[] { return this.weekData[toDateKey(d)] ?? []; }
  isToday(d: Date): boolean { return toDateKey(d) === this.todayKey; }
  dayLabel(d: Date): string { return `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`; }

  get weekLabel(): string {
    if (!this.weekDays.length) return '';
    const f = this.weekDays[0], l = this.weekDays[6];
    return `${f.getDate()} ${MONTHS_SHORT[f.getMonth()]} – ${l.getDate()} ${MONTHS_SHORT[l.getMonth()]} ${l.getFullYear()}`;
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  loadOperarios(): void {
    this.api.getSuperOpOperarios().subscribe({
      next: (d: any[]) => { this.operarios = d ?? []; this.cdr.detectChanges(); },
      error: ()         => { this.operarios = []; this.cdr.detectChanges(); },
    });
  }

  loadTareas(idOp?: number): void {
    this.api.getSuperOpTareas(this.todayKey, idOp).subscribe({
      next: (d: any[]) => {
        const res = d ?? [];
        idOp ? (this.filteredTareas = res) : (this.tareas = res);
        this.cdr.detectChanges();
      },
      error: () => {
        const res: TareaKiosko[] = [];
        idOp ? (this.filteredTareas = res) : (this.tareas = res);
        this.cdr.detectChanges();
      },
    });
  }

  get displayTareas(): TareaKiosko[] { return this.isFiltered ? this.filteredTareas : this.tareas; }
  get plannerTareas(): TareaKiosko[] { return [...this.displayTareas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)); }

  // ── Overlap layout ────────────────────────────────────────────────────────

  private timeToMin(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }

  getLayout(tasks: TareaKiosko[]): LayoutItem[] {
    if (!tasks.length) return [];
    const sorted = [...tasks].sort((a, b) => this.timeToMin(a.hora_inicio) - this.timeToMin(b.hora_inicio));
    const colEnds: number[] = [];
    const items: LayoutItem[] = [];
    for (const task of sorted) {
      const start = this.timeToMin(task.hora_inicio);
      let col = colEnds.findIndex(end => end <= start);
      if (col === -1) { col = colEnds.length; colEnds.push(0); }
      colEnds[col] = this.timeToMin(task.hora_fin);
      items.push({ task, col, cols: 0 });
    }
    const maxCols = colEnds.length;
    items.forEach(it => it.cols = maxCols);
    return items;
  }

  get calendarLayout(): LayoutItem[] { return this.getLayout(this.displayTareas); }

  getWeekLayout(tasks: TareaKiosko[]): LayoutItem[] { return this.getLayout(tasks); }

  // ── Filter ────────────────────────────────────────────────────────────────

  doFilter(): void {
    const op = this.operarios.find(o => o.id === this.selectedOperarioId);
    if (!op)                         { this.filterError = 'Selecciona un operario.'; return; }
    if (!this.filterPassword.trim()) { this.filterError = 'Ingresa tu contraseña.';  return; }
    this.filterError = '';
    this.isLoading   = true;
    this.api.verifyOperario(op.correo, this.filterPassword).subscribe({
      next: () => {
        this.isLoading       = false;
        this.isFiltered      = true;
        this.filteredOperario = op;
        this.filterPassword  = '';
        this.loadTareas(op.id);
        if (this.view === 'semana') this.loadWeekData();
        this.startInactivityWatch();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading   = false;
        this.filterError = err?.error?.message ?? 'Contraseña incorrecta.';
        this.cdr.detectChanges();
      },
    });
  }

  clearFilter(): void {
    this.isFiltered = false; this.filteredOperario = null; this.selectedOperarioId = null;
    this.filterPassword = ''; this.filterError = ''; this.filteredTareas = [];
    this.showTaskModal = false; this.showInactivityModal = false;
    this.weekData = {};
    this.clearTimers(); this.removeListeners();
    this.cdr.detectChanges();
  }

  // ── Task modal ────────────────────────────────────────────────────────────

  openTask(t: TareaKiosko): void {
    if (!this.isFiltered) return;
    this.selectedTarea = { ...t }; this.showTaskModal = true; this.cdr.detectChanges();
  }
  closeTask(): void { this.showTaskModal = false; this.selectedTarea = null; this.cdr.detectChanges(); }

  marcarCompletada(): void {
    if (!this.selectedTarea || !this.filteredOperario) return;
    this.isLoading = true;
    this.api.completarTarea(this.selectedTarea.id, this.filteredOperario.id).subscribe({
      next: () => {
        this.isLoading = false;
        const now = new Date().toISOString();
        const updateList = (list: TareaKiosko[]) => {
          const t = list.find(x => x.id === this.selectedTarea!.id);
          if (t) { t.estado = 'completada'; t.completado_en = now; }
        };
        updateList(this.filteredTareas); updateList(this.tareas);
        Object.values(this.weekData).forEach(updateList);
        this.closeTask(); this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); },
    });
  }

  // ── Inactivity ────────────────────────────────────────────────────────────

  startInactivityWatch(): void {
    ['mousemove','mousedown','keydown','touchstart'].forEach(ev => document.addEventListener(ev, this.activityHandler, true));
    this.scheduleTimeout();
  }
  removeListeners(): void {
    ['mousemove','mousedown','keydown','touchstart'].forEach(ev => document.removeEventListener(ev, this.activityHandler, true));
  }
  scheduleTimeout(): void {
    clearTimeout(this.inactivityTimeout);
    this.inactivityTimeout = setTimeout(() => { if (this.isFiltered && !this.showInactivityModal) this.startCountdown(); }, 60_000);
  }
  onActivity(): void { if (!this.showInactivityModal) this.scheduleTimeout(); }
  startCountdown(): void {
    this.countdown = 30; this.showInactivityModal = true; this.cdr.detectChanges();
    this.countdownInterval = setInterval(() => { this.countdown--; this.cdr.detectChanges(); if (this.countdown <= 0) this.clearFilter(); }, 1000);
  }
  continueSession(): void { clearInterval(this.countdownInterval); this.showInactivityModal = false; this.scheduleTimeout(); this.cdr.detectChanges(); }
  clearTimers(): void { clearTimeout(this.inactivityTimeout); clearInterval(this.countdownInterval); }

  // ── Visual helpers ────────────────────────────────────────────────────────

  getBlockTop(t: TareaKiosko): number {
    const [h, m] = t.hora_inicio.split(':').map(Number);
    return ((h + m / 60 - 7) / this.DAY_H) * 100;
  }
  getBlockHeight(t: TareaKiosko): number {
    const [sh, sm] = t.hora_inicio.split(':').map(Number);
    const [eh, em] = t.hora_fin.split(':').map(Number);
    return ((eh + em / 60 - sh - sm / 60) / this.DAY_H) * 100;
  }
  getGridTop(i: number): number { return (i / this.DAY_H) * 100; }
  getColor(idOp: number): string {
    const idx = this.operarios.findIndex(o => o.id === idOp);
    return OP_COLORS[(idx >= 0 ? idx : 0) % OP_COLORS.length];
  }
  estadoLabel(e?: string): string {
    return ({ asignada:'Asignada', en_progreso:'En Progreso', completada:'Completada', pendiente:'Pendiente', reasignada:'Reasignada' })[e ?? ''] ?? (e ?? '');
  }
  completadaHora(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
  }
}
