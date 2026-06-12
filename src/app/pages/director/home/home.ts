import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { NotificationService } from '../../../shared/services/notification.service';
import { ProjectService } from '../../../shared/services/project.service';
import { Api } from '../../../core/services/api';

const REFRESH_MS = 30_000;

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador', en_revision: 'En Revisión', rechazado: 'Rechazado',
  aprobado: 'Aprobado', en_produccion: 'En Producción', pausado: 'Pausado',
  completado: 'Completado', finalizado: 'Finalizado', cancelado: 'Cancelado',
  'Por Validar': 'Por Validar', 'En Desarrollo': 'En Desarrollo',
};

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit, OnDestroy {
  allProjects: any[] = [];
  filteredProjects: any[] = [];
  filterSearch = '';
  filterEstado = '';
  loading = true;
  error = '';
  private refreshSub: Subscription | null = null;

  get stats() {
    return {
      total:         this.allProjects.length,
      en_produccion: this.allProjects.filter(p => ['en_produccion','En Desarrollo'].includes(p.estado ?? '')).length,
      en_revision:   this.allProjects.filter(p => ['en_revision','Por Validar'].includes(p.estado ?? '')).length,
      aprobado:      this.allProjects.filter(p => p.estado === 'aprobado').length,
    };
  }

  constructor(
    private router: Router,
    private notifSvc: NotificationService,
    private projectSvc: ProjectService,
    private apiSvc: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadProjects();
      this.refreshSub = interval(REFRESH_MS).subscribe(() => this.loadProjects());
    }
  }

  ngOnDestroy(): void { this.refreshSub?.unsubscribe(); }

  loadProjects(): void {
    this.loading = true;
    this.error = '';
    const userId = this.apiSvc.getCurrentUserId();
    const filters: Record<string, any> = { limit: 50 };
    if (userId) filters['director'] = userId;

    this.projectSvc.getProjects(filters).subscribe({
      next: ({ data }) => {
        this.allProjects = data;
        this.applyFilters();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'No se pudieron cargar los proyectos.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  applyFilters(): void {    
    this.filteredProjects = this.allProjects.filter(p => {
      const matchSearch = !this.filterSearch
        || p.nombre?.toLowerCase().includes(this.filterSearch.toLowerCase())
        || p.cliente?.razon_social?.toLowerCase().includes(this.filterSearch.toLowerCase());
      const matchEstado = !this.filterEstado || p.estado === this.filterEstado;
      return matchSearch && matchEstado;
    });    
  }

  goToDetail(id: number): void { this.router.navigate(['/dashboard/director/project', id]); }
  goToEdit(id: number): void   { this.router.navigate(['/dashboard/director/project-new'], { queryParams: { id } }); }
  goToNew(): void              { this.router.navigate(['/dashboard/director/project-new']); }
  goToEvidencias(): void       { this.router.navigate(['/dashboard/director/evidencias']); }

  getEstadoLabel(estado: string | null | undefined): string {
    if (!estado) return 'Sin estado';
    return ESTADO_LABELS[estado] ?? estado;
  }

  getEstadoClass(estado: string | null | undefined): string {
    if (!estado) return 'estado-sin-estado';
    return 'estado-' + estado.toLowerCase().replace(/\s/g, '_');
  }

  formatCOP(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value ?? 0);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split(/[-T]/);
    const m = parseInt(parts[1] ?? '1', 10);
    const d = parseInt(parts[2] ?? '1', 10);
    return `${d} ${MONTHS[m - 1] ?? ''}`;
  }
}
