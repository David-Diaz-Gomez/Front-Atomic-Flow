import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { ProjectService } from '../../../shared/services/project.service';
import { Api } from '../../../core/services/api';

Chart.register(...registerables);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const CHART_COLORS = [
  '#a5b4fc', '#fcd34d', '#6ee7b7', '#fca5a5',
  '#93c5fd', '#c4b5fd', '#fdba74', '#5eead4',
  '#f9a8d4', '#bef264', '#67e8f9', '#ddd6fe',
];

type Tab = 'grafico' | 'ranking';

@Component({
  selector: 'app-reports',
  standalone: false,
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit, OnDestroy {
  @ViewChild('ocupacionChart')   ocupacionChartRef!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('presupuestoChart') presupuestoChartRef!: ElementRef<HTMLCanvasElement>;

  proyectos: any[] = [];
  loadingCatalogos = true;

  // ── Filtros generales ──
  filtroProyecto: number | '' = '';
  filtroProyectoText = '';
  showProyectoDropdown = false;
  filtroEstado: '' | 'activo' | 'finalizado' = '';
  filtroFechaInicio: string;
  filtroFechaFin: string;

  // ── Filtro sección 2 ──
  tipoRecurso: 'operarios' | 'maquinaria' = 'operarios';
  activeTab: Tab = 'grafico';

  // ── Gráfico de torta (ocupación) ──
  ocupacionData: { id_proyecto: number; nombre_proyecto: string; total_horas: number }[] = [];
  loadingOcupacion = false;
  private ocupacionChart: Chart | null = null;

  // ── Gráfico de barras (presupuesto) ──
  presupuestoData: { id_proyecto: number; nombre_proyecto: string; presupuesto_proyectado: number; gasto_real: number }[] = [];
  loadingPresupuesto = false;
  private presupuestoChart: Chart | null = null;

  // ── Ranking ──
  rankingData: { id_recurso: number; nombre: string; total_horas: number; total_tareas: number }[] = [];
  loadingRanking = false;
  rankingSearch = '';
  rankingSortDir: 'desc' | 'asc' = 'desc';

  // ── KPIs Sección 1 (placeholder) ──
  kpis = {
    completadas:   { valor: 128, pct: 62 },
    noCompletadas: { valor: 54,  pct: 26 },
    conRetraso:    { valor: 18,  pct: 9  },
    bloqueadas:    { valor: 12,  pct: 6  },
  };

  proyectosPorEstado = {
    en_produccion: { valor: 9,  pct: 45, label: 'En Producción' },
    pausado:       { valor: 4,  pct: 20, label: 'Pausado' },
    finalizado:    { valor: 7,  pct: 35, label: 'Finalizado' },
  };

  constructor(
    private projectSvc: ProjectService,
    private api: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    const hoy = new Date();
    const haceUnMes = new Date();
    haceUnMes.setMonth(haceUnMes.getMonth() - 1);
    this.filtroFechaInicio = isoDate(haceUnMes);
    this.filtroFechaFin    = isoDate(hoy);
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadCatalogos();
      this.loadAll();
    }
  }

  ngOnDestroy(): void {
    this.ocupacionChart?.destroy();
    this.presupuestoChart?.destroy();
  }

  // ── Catálogos ──────────────────────────────────────────────────────────────

  loadCatalogos(): void {
    this.loadingCatalogos = true;
    this.projectSvc.getProjects({ limit: 200 }).subscribe({
      next: ({ data }) => { this.proyectos = data; this.loadingCatalogos = false; },
      error: () => { this.proyectos = []; this.loadingCatalogos = false; },
    });
  }

  // ── Filtros generales ──────────────────────────────────────────────────────

  /** Proyectos filtrados por estado (para el datalist y para proyectoSeleccionado). */
  get proyectosFiltrados(): any[] {
    if (!this.filtroEstado) return this.proyectos;
    return this.proyectos.filter(p => {
      const fin = p.estado === 'finalizado';
      return this.filtroEstado === 'finalizado' ? fin : !fin;
    });
  }

  get proyectoSeleccionado(): any | null {
    if (!this.filtroProyecto) return null;
    return this.proyectos.find(p => p.id === this.filtroProyecto) ?? null;
  }

  get proyectosBusqueda(): any[] {
    const q = this.filtroProyectoText.trim().toLowerCase();
    const base = this.proyectosFiltrados;
    return q ? base.filter(p => p.nombre.toLowerCase().includes(q)) : base;
  }

  onProyectoTextChange(text: string): void {
    this.showProyectoDropdown = true;
    if (!text.trim() && this.filtroProyecto !== '') {
      this.filtroProyecto = '';
      this.onFilterChange();
    }
  }

  selectProyecto(p: any): void {
    this.filtroProyectoText = p.nombre;
    this.filtroProyecto = p.id;
    this.showProyectoDropdown = false;
    this.onFilterChange();
  }

  clearProyecto(): void {
    this.filtroProyectoText = '';
    this.filtroProyecto = '';
    this.showProyectoDropdown = false;
    this.onFilterChange();
  }

  onProyectoBlur(): void {
    setTimeout(() => {
      this.showProyectoDropdown = false;
      if (this.filtroProyectoText && !this.filtroProyecto) {
        this.filtroProyectoText = '';
      }
    }, 180);
  }

  /** Cambio de estado: limpiar proyecto si ya no pertenece al estado elegido. */
  onEstadoChange(): void {
    if (this.filtroProyecto) {
      const aun = this.proyectosFiltrados.find(p => p.id === this.filtroProyecto);
      if (!aun) { this.filtroProyecto = ''; this.filtroProyectoText = ''; }
    }
    this.onFilterChange();
  }

  onFilterChange(): void {
    this.loadAll();
  }

  // ── Carga de datos ─────────────────────────────────────────────────────────

  private get currentFilters() {
    return {
      id_proyecto:  this.filtroProyecto  || undefined,
      estado:       this.filtroEstado    || undefined,
      fecha_inicio: this.filtroFechaInicio || undefined,
      fecha_fin:    this.filtroFechaFin   || undefined,
    };
  }

  loadAll(): void {
    this.loadOcupacion();
    this.loadRanking();
    this.loadPresupuesto();
  }

  loadOcupacion(): void {
    this.loadingOcupacion = true;
    this.api.getOcupacionRecursos(this.tipoRecurso, this.currentFilters).subscribe({
      next: (data) => {
        this.ocupacionData = data;
        this.loadingOcupacion = false;
        this.cdr.detectChanges();
        this.renderOcupacionChart();
      },
      error: () => { this.ocupacionData = []; this.loadingOcupacion = false; },
    });
  }

  loadRanking(): void {
    this.loadingRanking = true;
    this.api.getRankingRecursos(this.tipoRecurso, this.currentFilters).subscribe({
      next: (data) => { this.rankingData = data; this.loadingRanking = false; },
      error: () => { this.rankingData = []; this.loadingRanking = false; },
    });
  }

  loadPresupuesto(): void {
    this.loadingPresupuesto = true;
    this.api.getPresupuesto(this.currentFilters).subscribe({
      next: (data) => {
        this.presupuestoData = data;
        this.loadingPresupuesto = false;
        this.cdr.detectChanges();
        this.renderPresupuestoChart();
      },
      error: () => { this.presupuestoData = []; this.loadingPresupuesto = false; },
    });
  }

  private renderPresupuestoChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.presupuestoChartRef?.nativeElement) return;

    this.presupuestoChart?.destroy();
    this.presupuestoChart = null;
    if (!this.presupuestoData.length) return;

    const labels    = this.presupuestoData.map(d => d.nombre_proyecto);
    const proyect   = this.presupuestoData.map(d => Number(d.presupuesto_proyectado));
    const real      = this.presupuestoData.map(d => Number(d.gasto_real));

    const fmt = (v: number) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

    this.presupuestoChart = new Chart(this.presupuestoChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Proyectado',
            data: proyect,
            backgroundColor: 'rgba(165,180,252,0.75)',
            borderColor: '#6366f1',
            borderWidth: 1.5,
            borderRadius: 6,
          },
          {
            label: 'Real',
            data: real,
            backgroundColor: 'rgba(253,186,116,0.75)',
            borderColor: '#f97316',
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { size: 12 }, padding: 16 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11 },
              maxRotation: 35,
              callback(_val, i) {
                const label = (labels[i] ?? '').toString();
                return label.length > 18 ? label.slice(0, 16) + '…' : label;
              },
            },
          },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: {
              font: { size: 11 },
              callback: (v) => v !== null ? fmt(Number(v)) : '',
            },
          },
        },
      },
    });
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  setTab(tab: Tab): void {
    this.activeTab = tab;
    if (tab === 'grafico') {
      this.ocupacionChart = null; // canvas fue destruido por *ngIf
      if (this.ocupacionData.length) {
        this.cdr.detectChanges();
        this.renderOcupacionChart();
      }
    }
  }

  onTipoChange(): void {
    this.ocupacionChart?.destroy();
    this.ocupacionChart = null;
    this.rankingSearch = '';
    this.loadAll();
  }

  // ── Gráfico ────────────────────────────────────────────────────────────────

  private renderOcupacionChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.ocupacionChartRef?.nativeElement) return;

    this.ocupacionChart?.destroy();
    this.ocupacionChart = null;
    if (!this.ocupacionData.length) return;

    const labels = this.ocupacionData.map(d => d.nombre_proyecto);
    const values = this.ocupacionData.map(d => Number(d.total_horas));
    const total  = values.reduce((a, b) => a + b, 0);
    const colors = this.ocupacionData.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
    const labelTipo = this.tipoRecurso === 'operarios' ? 'Operarios' : 'Maquinaria';

    this.ocupacionChart = new Chart(this.ocupacionChartRef.nativeElement, {
      type: 'pie',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              font: { size: 12 }, padding: 16,
              generateLabels(chart) {
                const ds = chart.data.datasets[0];
                return (chart.data.labels as string[]).map((label, i) => {
                  const val = ds.data[i] as number;
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                  return {
                    text: `${label} — ${pct}%`,
                    fillStyle: (ds.backgroundColor as string[])[i],
                    strokeStyle: '#fff', lineWidth: 2, hidden: false, index: i,
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const val = ctx.parsed as number;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                return ` ${val.toFixed(2)} h  (${pct}%)  — ${labelTipo}`;
              },
            },
          },
        },
      },
    });
  }

  // ── Ranking ────────────────────────────────────────────────────────────────

  get rankingFiltered() {
    const q = this.rankingSearch.trim().toLowerCase();
    let list = q
      ? this.rankingData.filter(r => r.nombre.toLowerCase().includes(q))
      : [...this.rankingData];

    return this.rankingSortDir === 'asc'
      ? list.sort((a, b) => Number(a.total_horas) - Number(b.total_horas))
      : list.sort((a, b) => Number(b.total_horas) - Number(a.total_horas));
  }

  rankingBarWidth(horas: number): string {
    const max = this.rankingFiltered.reduce((m, r) => Math.max(m, Number(r.total_horas)), 1);
    return `${Math.round((Number(horas) / max) * 100)}%`;
  }

  rankingColor(i: number): string {
    return CHART_COLORS[i % CHART_COLORS.length];
  }

  toggleSortDir(): void {
    this.rankingSortDir = this.rankingSortDir === 'desc' ? 'asc' : 'desc';
  }
}
