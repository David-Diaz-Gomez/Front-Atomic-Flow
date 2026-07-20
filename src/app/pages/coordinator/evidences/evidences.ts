import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProjectService } from '../../../shared/services/project.service';
import { CatalogService } from '../../../shared/services/catalog.service';
import { Api } from '../../../core/services/api';
import Swal from 'sweetalert2';
import { forkJoin } from 'rxjs';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-coord-evidences',
  standalone: false,
  templateUrl: './evidences.html',
  styleUrl: './evidences.scss',
})
export class CoordEvidences implements OnInit {
  tareas: any[] = [];
  loading = true;
  filterProyecto: number | null = null;

  // Evidence modal
  showEvidModal = false;
  evidTarea: any = null;
  selectedFiles: File[] = [];
  evidDesc = '';
  evidSaving = false;
  previews: string[] = [];

  // Reassign modal
  showReasignModal = false;
  reasignTarea: any = null;
  operarios: any[] = [];
  reasignForm = { id_operario: null as number | null, fecha_inicio: '', fecha_fin: '', hora_inicio: '07:00', hora_fin: '17:00', motivo: '' };
  disponibilidad: { ocupado: any[]; libre: any[] } | null = null;
  dispLoading = false;
  reasignSaving = false;

  constructor(
    private projectSvc: ProjectService,
    private catalogSvc: CatalogService,
    private api: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private pid: object,
  ) {}

  get isMobile(): boolean {
    return isPlatformBrowser(this.pid) && window.innerWidth <= 768;
  }

  ngOnInit(): void {
    this.loadTareas();
    this.catalogSvc.getUsersByRole(4).subscribe({
      next: (d: any[]) => { this.operarios = d; this.cdr.detectChanges(); },
      error: () => {},
    });
  }

  loadTareas(): void {
    this.loading = true;
    const idCoord = this.api.getCurrentUserId() ?? 0;
    this.projectSvc.getTareasCompletadas(idCoord, this.filterProyecto ?? undefined).subscribe({
      next: (d: any[]) => { this.tareas = d; this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  // ── Evidence modal ────────────────────────────────────────────────────────

  openEvidModal(t: any): void {
    this.evidTarea = t;
    this.selectedFiles = [];
    this.previews = [];
    this.evidDesc = '';
    this.showEvidModal = true;
    this.cdr.detectChanges();
  }

  closeEvidModal(): void { this.showEvidModal = false; this.evidTarea = null; this.cdr.detectChanges(); }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    this.selectedFiles = Array.from(input.files).slice(0, 10);
    this.previews = [];
    for (const f of this.selectedFiles) {
      const reader = new FileReader();
      reader.onload = (e: any) => { this.previews.push(e.target.result); this.cdr.detectChanges(); };
      reader.readAsDataURL(f);
    }
    this.cdr.detectChanges();
  }

  removeFile(i: number): void {
    this.selectedFiles.splice(i, 1);
    this.previews.splice(i, 1);
    this.cdr.detectChanges();
  }

  subirEvidencias(): void {
    if (!this.selectedFiles.length || !this.evidTarea) return;
    this.evidSaving = true;
    const fd = new FormData();
    for (const f of this.selectedFiles) fd.append('imagen', f);
    fd.append('descripcion', this.evidDesc);
    fd.append('id_coordinador', String(this.api.getCurrentUserId() ?? ''));

    this.projectSvc.subirEvidencias(this.evidTarea.id, fd).subscribe({
      next: () => {
        this.evidSaving = false;
        this.tareas = this.tareas.filter(t => t.id !== this.evidTarea!.id);
        void Swal.fire({ icon: 'success', title: 'Evidencias subidas', timer: 1500, showConfirmButton: false });
        this.closeEvidModal();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.evidSaving = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudieron subir las evidencias', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  /** Sube evidencia Y verifica la tarea en un solo clic (si tiene archivos + está en_revision). */
  subirYVerificar(): void {
    if (!this.evidTarea) return;
    this.evidSaving = true;
    const tarea = this.evidTarea;

    const verificar$ = this.projectSvc.completarTarea(tarea.fase_id, tarea.id);

    if (this.selectedFiles.length) {
      const fd = new FormData();
      for (const f of this.selectedFiles) fd.append('imagen', f);
      fd.append('descripcion', this.evidDesc);
      fd.append('id_coordinador', String(this.api.getCurrentUserId() ?? ''));
      forkJoin([this.projectSvc.subirEvidencias(tarea.id, fd), verificar$]).subscribe({
        next: () => {
          this.evidSaving = false;
          this.tareas = this.tareas.filter(t => t.id !== tarea.id);
          void Swal.fire({ icon: 'success', title: 'Evidencia subida y tarea verificada', timer: 1800, showConfirmButton: false });
          this.closeEvidModal(); this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.evidSaving = false;
          void Swal.fire('Error', err?.error?.message ?? 'No se pudo completar la operación', 'error');
          this.cdr.detectChanges();
        },
      });
    } else {
      verificar$.subscribe({
        next: () => {
          this.evidSaving = false;
          this.tareas = this.tareas.filter(t => t.id !== tarea.id);
          void Swal.fire({ icon: 'success', title: 'Tarea verificada y completada', timer: 1500, showConfirmButton: false });
          this.closeEvidModal(); this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.evidSaving = false;
          void Swal.fire('Error', err?.error?.message ?? 'No se pudo verificar la tarea', 'error');
          this.cdr.detectChanges();
        },
      });
    }
  }

  /** Verifica la tarea directamente desde la tarjeta (sin abrir modal de evidencia). */
  verificarTarea(t: any): void {
    void Swal.fire({
      title: '¿Verificar tarea?',
      html: `<b>${t.nombre}</b><br><small>El operario la marcó como lista. ¿Confirmas sin subir evidencia?</small>`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Sí, verificar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#00A859',
    }).then(r => {
      if (!r.isConfirmed) return;
      this.projectSvc.completarTarea(t.fase_id, t.id).subscribe({
        next: () => {
          this.tareas = this.tareas.filter(x => x.id !== t.id);
          void Swal.fire({ icon: 'success', title: 'Tarea verificada', timer: 1400, showConfirmButton: false });
          this.cdr.detectChanges();
        },
        error: (err: any) => void Swal.fire('Error', err?.error?.message ?? 'No se pudo verificar', 'error'),
      });
    });
  }

  estadoLabel(estado: string): string {
    return estado === 'en_revision' ? 'En revisión' : 'Completada';
  }

  // ── Reassign modal ────────────────────────────────────────────────────────

  openReasignModal(t: any): void {
    this.reasignTarea = t;
    this.reasignForm = {
      id_operario: t.id_operario ?? null,
      fecha_inicio: this.today(),
      fecha_fin:    this.today(),
      hora_inicio: '07:00', hora_fin: '17:00', motivo: '',
    };
    this.disponibilidad = null;
    this.showReasignModal = true;
    this.cdr.detectChanges();
  }

  closeReasignModal(): void { this.showReasignModal = false; this.reasignTarea = null; this.cdr.detectChanges(); }

  checkDisponibilidad(): void {
    if (!this.reasignForm.id_operario || !this.reasignForm.fecha_inicio) return;
    this.dispLoading = true;
    this.projectSvc.getOperarioDisponibilidad(this.reasignForm.id_operario, this.reasignForm.fecha_inicio).subscribe({
      next: (d: any) => {
        this.disponibilidad = d;
        this.dispLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.dispLoading = false; this.cdr.detectChanges(); },
    });
  }

  reasignar(): void {
    if (!this.reasignTarea || !this.reasignForm.id_operario || !this.reasignForm.fecha_inicio) return;
    this.reasignSaving = true;
    this.projectSvc.reasignarTarea(this.reasignTarea.id, {
      id_operario:  this.reasignForm.id_operario,
      fecha_inicio: this.reasignForm.fecha_inicio,
      fecha_fin:    this.reasignForm.fecha_fin || this.reasignForm.fecha_inicio,
      hora_inicio:  this.reasignForm.hora_inicio,
      hora_fin:     this.reasignForm.hora_fin,
      motivo:       this.reasignForm.motivo,
    }).subscribe({
      next: () => {
        this.reasignSaving = false;
        this.tareas = this.tareas.filter(t => t.id !== this.reasignTarea!.id);
        void Swal.fire({ icon: 'success', title: 'Tarea reasignada', timer: 1500, showConfirmButton: false });
        this.closeReasignModal();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.reasignSaving = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo reasignar', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private today(): string { return new Date().toISOString().substring(0, 10); }

  formatDateTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  operarioNombre(id: number): string {
    const op = this.operarios.find(o => o.id === id);
    return op ? `${op.nombre ?? ''} ${op.apellido ?? ''}`.trim() : `#${id}`;
  }
}
