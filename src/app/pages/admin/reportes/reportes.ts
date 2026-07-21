import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import * as XLSX from 'xlsx';
import { Api } from '../../../core/services/api';
import { ProjectService } from '../../../shared/services/project.service';

Chart.register(...registerables);

type TabMO = 'proyecto' | 'operario';

@Component({
  selector: 'app-reportes',
  standalone: false,
  templateUrl: './reportes.html',
  styleUrl: './reportes.scss',
})
export class Reportes implements OnInit, OnDestroy {
  @ViewChild('moChart') moChartRef!: ElementRef<HTMLCanvasElement>;

  // ── Filtros globales ───────────────────────────────────────────────────────
  filtroEstado: '' | 'activo' | 'finalizado' = 'activo';
  filtroProyecto: number | '' = '';
  filtroProyectoText = '';
  showProyectoDropdown = false;

  proyectos: any[] = [];

  // ── Tabs ──────────────────────────────────────────────────────────────────
  activeTab: TabMO = 'proyecto';

  // ── Filtros exclusivos del tab Operario ───────────────────────────────────
  filtroFechaInicio: string = '';
  filtroFechaFin: string = '';

  // ── Por proyecto ──────────────────────────────────────────────────────────
  moData: any[] = [];
  loadingMO = false;
  private moChart: Chart | null = null;

  // ── Por operario ──────────────────────────────────────────────────────────
  pagoData: any[] = [];
  loadingPago = false;

  constructor(
    private api: Api,
    private projectSvc: ProjectService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      this.filtroFechaInicio = `${y}-${m}-01`;
      this.filtroFechaFin    = new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10);

      this.projectSvc.getProjects({ limit: 200 }).subscribe({
        next: ({ data }) => { this.proyectos = data; },
        error: () => { this.proyectos = []; },
      });
      this.loadAll();
    }
  }

  ngOnDestroy(): void {
    this.moChart?.destroy();
  }

  // ── Carga ─────────────────────────────────────────────────────────────────

  loadAll(): void {
    this.loadMO();
    this.loadPago();
  }

  loadMO(): void {
    this.loadingMO = true;
    this.moChart?.destroy();
    this.moChart = null;
    this.api.getManoDeObra(this.currentFilters).subscribe({
      next: (data) => {
        this.moData = data;
        this.loadingMO = false;
        this.cdr.detectChanges();
        this.renderMOChart();
      },
      error: () => { this.moData = []; this.loadingMO = false; },
    });
  }

  loadPago(): void {
    this.loadingPago = true;
    this.api.getPagoOperarios(this.pagoFilters).subscribe({
      next: (data) => { this.pagoData = data; this.loadingPago = false; },
      error: () => { this.pagoData = []; this.loadingPago = false; },
    });
  }

  private get currentFilters() {
    return {
      estado:      this.filtroEstado   || undefined,
      id_proyecto: this.filtroProyecto || undefined,
    };
  }

  private get pagoFilters() {
    return {
      estado:       this.filtroEstado      || undefined,
      id_proyecto:  this.filtroProyecto    || undefined,
      fecha_inicio: this.filtroFechaInicio || undefined,
      fecha_fin:    this.filtroFechaFin    || undefined,
    };
  }

  onFilterChange(): void { this.loadAll(); }

  setTab(tab: TabMO): void {
    this.activeTab = tab;
    if (tab === 'proyecto') {
      this.moChart = null;
      if (this.moData.length) { this.cdr.detectChanges(); this.renderMOChart(); }
    }
  }

  // ── Proyecto autocomplete ──────────────────────────────────────────────────

  get proyectosBusqueda(): any[] {
    const q = this.filtroProyectoText.trim().toLowerCase();
    const base = this.filtroEstado
      ? this.proyectos.filter(p => this.filtroEstado === 'finalizado' ? p.estado === 'finalizado' : p.estado !== 'finalizado')
      : this.proyectos;
    return q ? base.filter(p => p.nombre.toLowerCase().includes(q)) : base;
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
      if (this.filtroProyectoText && !this.filtroProyecto) this.filtroProyectoText = '';
    }, 180);
  }

  // ── Totales ───────────────────────────────────────────────────────────────

  get totalPresupuestoMO(): number  { return this.moData.reduce((s, r) => s + Number(r.presupuesto_mo), 0); }
  get totalCostoRealMO(): number    { return this.moData.reduce((s, r) => s + Number(r.costo_real_mo), 0); }
  get totalHorasMO(): number        { return this.moData.reduce((s, r) => s + Number(r.total_horas_reales), 0); }
  get totalDiferenciaMO(): number   { return this.totalPresupuestoMO - this.totalCostoRealMO; }
  get totalPagadoOp(): number       { return this.pagoData.reduce((s, r) => s + Number(r.total_pagado), 0); }
  get totalHorasOp(): number        { return this.pagoData.reduce((s, r) => s + Number(r.total_horas), 0); }

  // ── Helpers de formato ────────────────────────────────────────────────────

  formatCop(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  estadoLabel(e: string): string {
    const map: Record<string, string> = {
      en_produccion: 'En Producción', pausado: 'Pausado',
      finalizado: 'Finalizado', aprobado: 'Aprobado',
    };
    return map[e] ?? e;
  }

  estadoClass(e: string): string {
    const map: Record<string, string> = {
      en_produccion: 'badge-green', pausado: 'badge-yellow',
      finalizado: 'badge-blue', aprobado: 'badge-indigo',
    };
    return map[e] ?? 'badge-gray';
  }

  pctClass(pct: number | null): string {
    if (pct === null) return 'pct-none';
    if (pct > 100)  return 'pct-over';
    if (pct >= 80)  return 'pct-warn';
    return 'pct-ok';
  }

  difClass(dif: number): string {
    if (dif < 0)    return 'dif-over';
    if (dif === 0)  return '';
    return 'dif-ok';
  }

  // ── Excel / CSV ───────────────────────────────────────────────────────────

  downloadMOExcel(): void {
    const cols = [
      { key: 'nombre_proyecto',      label: 'Proyecto' },
      { key: 'estado',               label: 'Estado' },
      { key: 'fecha_inicio',         label: 'Fecha Inicio' },
      { key: 'fecha_fin',            label: 'Fecha Fin' },
      { key: 'total_operarios',      label: 'Operarios' },
      { key: 'total_horas_reales',   label: 'Horas Reales' },
      { key: 'presupuesto_mo',       label: 'Presupuesto MO (COP)' },
      { key: 'costo_real_mo',        label: 'Costo Real MO (COP)' },
      { key: 'diferencia',           label: 'Diferencia (COP)' },
      { key: 'porcentaje_ejecucion', label: '% Ejecución' },
    ];
    const data = this.moData.map(r => ({
      ...r,
      fecha_inicio: this.formatDate(r.fecha_inicio),
      fecha_fin:    this.formatDate(r.fecha_fin),
    }));
    this.downloadXlsx(data, cols, 'reporte_mano_de_obra.xlsx', 'Mano de Obra');
  }

  downloadPagoExcel(): void {
    const cols = [
      { key: 'nombre_operario', label: 'Operario' },
      { key: 'valor_hora',      label: 'Valor/Hora (COP)' },
      { key: 'total_proyectos', label: 'Proyectos' },
      { key: 'total_horas',     label: 'Horas Totales' },
      { key: 'total_pagado',    label: 'Valor Total (COP)' },
    ];
    this.downloadXlsx(this.pagoData, cols, 'reporte_valor_operarios.xlsx', 'Valor Operarios');
  }

  private downloadXlsx(data: any[], cols: { key: string; label: string }[], filename: string, sheetName: string): void {
    const rows = data.map(row => {
      const mapped: Record<string, any> = {};
      for (const col of cols) {
        mapped[col.label] = row[col.key] ?? '';
      }
      return mapped;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  }

  // ── Gráfico ───────────────────────────────────────────────────────────────

  private renderMOChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.moChartRef?.nativeElement) return;
    this.moChart?.destroy();
    this.moChart = null;
    if (!this.moData.length) return;

    const labels   = this.moData.map(d => d.nombre_proyecto);
    const presup   = this.moData.map(d => Number(d.presupuesto_mo));
    const real     = this.moData.map(d => Number(d.costo_real_mo));
    const fmt      = (v: number) => this.formatCop(v);

    this.moChart = new Chart(this.moChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Presupuesto MO', data: presup, backgroundColor: 'rgba(165,180,252,0.75)', borderColor: '#6366f1', borderWidth: 1.5, borderRadius: 6 },
          { label: 'Real MO',        data: real,   backgroundColor: 'rgba(110,231,183,0.75)', borderColor: '#10b981', borderWidth: 1.5, borderRadius: 6 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, padding: 16 } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y ?? 0)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 35, callback(_v, i) { const l = (labels[i] ?? '').toString(); return l.length > 18 ? l.slice(0, 16) + '…' : l; } } },
          y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, callback: (v) => v !== null ? fmt(Number(v)) : '' } },
        },
      },
    });
  }
}
