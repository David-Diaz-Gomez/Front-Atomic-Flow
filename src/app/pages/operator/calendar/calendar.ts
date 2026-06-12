import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, Subscription, interval } from 'rxjs';
import { Api } from '../../../core/services/api';

const WEEK_DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS    = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const COLOR_PALETTE = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#ec4899','#06b6d4'];
const REFRESH_MS = 30_000;

interface Bloque {
  id: number;
  tarea_id: number;
  tarea: string;
  proyecto: string;
  color: string;
  hora_inicio: string;
  hora_fin: string;
}

interface DiaAsignado {
  fecha: string;   // YYYY-MM-DD
  bloques: Bloque[];
}

@Component({
  selector: 'app-op-calendar',
  standalone: false,
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class OpCalendar implements OnInit, OnDestroy {
  private weekOffset = 0;
  weekDays: Date[] = [];
  selectedDay: Date | null = null;
  selectedDayBloques: Bloque[] = [];
  bloques: DiaAsignado[] = [];
  loading = false;

  private projectColors = new Map<string, string>();
  private refreshSub: Subscription | null = null;

  readonly HOURS = [7,8,9,10,11,12,13,14,15,16,17,18];
  readonly DAY_H = 11; // 7:00 – 18:00

  constructor(private router: Router, private api: Api, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.buildWeek();
    this.loadWeek();
    this.refreshSub = interval(REFRESH_MS).subscribe(() => this.loadWeek());
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  buildWeek(): void {
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - dow + 1 + this.weekOffset * 7);
    this.weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  loadWeek(): void {
    this.loading = true;
    const idOp = this.api.getCurrentUserId() ?? undefined;
    const keys = this.weekDays.map(d => this.toKey(d));
    forkJoin(keys.map(key => this.api.getSuperOpTareas(key, idOp))).subscribe({
      next: (results: any[][]) => {
        this.bloques = results.map((tasks, i) => ({
          fecha: keys[i],
          bloques: (tasks ?? []).map(t => this.toBloque(t)),
        }));
        this.loading = false;
        const sel = this.selectedDay ?? new Date();
        this.selectDay(sel);
        this.cdr.detectChanges();
      },
      error: () => { this.bloques = []; this.loading = false; this.cdr.detectChanges(); },
    });
  }

  private toBloque(t: any): Bloque {
    const proyecto = t.proyecto ?? '';
    if (!this.projectColors.has(proyecto)) {
      this.projectColors.set(proyecto, COLOR_PALETTE[this.projectColors.size % COLOR_PALETTE.length]);
    }
    return {
      id: t.id,
      tarea_id: t.id,
      tarea: t.nombre,
      proyecto,
      color: this.projectColors.get(proyecto)!,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
    };
  }

  prevWeek(): void { this.weekOffset--; this.buildWeek(); this.loadWeek(); }
  nextWeek(): void { this.weekOffset++; this.buildWeek(); this.loadWeek(); }

  selectDay(d: Date): void {
    this.selectedDay = d;
    const key = this.toKey(d);
    const found = this.bloques.find(b => b.fecha === key);
    this.selectedDayBloques = found?.bloques ?? [];
  }

  private toKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  isToday(d: Date): boolean {
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }

  isSelected(d: Date): boolean {
    return this.selectedDay?.toDateString() === d.toDateString();
  }

  hasBloques(d: Date): boolean {
    const found = this.bloques.find(b => b.fecha === this.toKey(d));
    return (found?.bloques?.length ?? 0) > 0;
  }

  dayLabel(d: Date): string { return String(d.getDate()); }
  weekDayLabel(d: Date): string { return WEEK_DAYS[d.getDay()]; }
  monthLabel(d: Date): string { return MONTHS[d.getMonth()]; }

  get weekLabel(): string {
    if (!this.weekDays.length) return '';
    const f = this.weekDays[0], l = this.weekDays[6];
    return `${f.getDate()} ${MONTHS[f.getMonth()]} – ${l.getDate()} ${MONTHS[l.getMonth()]} ${l.getFullYear()}`;
  }

  get selectedDayLabel(): string {
    if (!this.selectedDay) return '';
    return this.selectedDay.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  getBlockTop(b: Bloque): number {
    const [h, m] = b.hora_inicio.split(':').map(Number);
    return ((h + m/60 - 7) / this.DAY_H) * 100;
  }

  getBlockHeight(b: Bloque): number {
    const [sh, sm] = b.hora_inicio.split(':').map(Number);
    const [eh, em] = b.hora_fin.split(':').map(Number);
    const dur = (eh + em/60) - (sh + sm/60);
    return (dur / this.DAY_H) * 100;
  }

  goTask(id: number): void { this.router.navigate(['/dashboard/operator/task', id]); }

  totalHorasHoy(): string {
    const h = this.selectedDayBloques.reduce((s, b) => {
      const [sh,sm] = b.hora_inicio.split(':').map(Number);
      const [eh,em] = b.hora_fin.split(':').map(Number);
      return s + (eh + em/60) - (sh + sm/60);
    }, 0);
    return h % 1 === 0 ? String(h) : h.toFixed(1);
  }
}
