import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProjectService } from '../../../shared/services/project.service';
import { Api } from '../../../core/services/api';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-coord-evidences',
  standalone: false,
  templateUrl: './evidences.html',
  styleUrl: './evidences.scss',
})
export class CoordEvidences implements OnInit {
  // Tareas con operarios que marcaron su horario (nuevos pendientes de aprobación)
  tareasPendientes: any[] = [];
  // Tareas completadas/en_revision para subir evidencias (flujo legacy)
  tareasEvidencia: any[] = [];
  loading = true;
  filterProyecto: number | null = null;
  activeTab: 'pendientes' | 'evidencias' = 'pendientes';

  // Aprobación forzada modal
  showForzadaModal = false;
  forzadaTarea: any = null;
  forzadaJustificacion = '';
  forzadaSaving = false;

  // Evidence modal (evidencias legacy)
  showEvidModal = false;
  evidTarea: any = null;
  selectedFiles: File[] = [];
  evidDesc = '';
  evidSaving = false;
  previews: string[] = [];

  // Rechazar parte (mismo operario, reprograma su horario — no crea tarea nueva)
  showRechazarModal = false;
  rechazarTarea: any = null;
  rechazarOperario: any = null;
  rechazarForm = { fecha_inicio: '', fecha_fin: '', hora_inicio: '07:00', hora_fin: '17:00', motivo: '' };
  rechazarSaving = false;

  approvingId: string | null = null; // `${tareaId}_${idUsuario}` mientras se aprueba
  completandoId: number | null = null; // tareaId mientras se completa (botón fantasma)

  constructor(
    private projectSvc: ProjectService,
    private api: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private pid: object,
  ) {}

  get isMobile(): boolean {
    return isPlatformBrowser(this.pid) && window.innerWidth <= 768;
  }

  get pendienteCount(): number {
    return this.tareasPendientes.reduce((acc, t) => acc + t.operarios.filter((o: any) => o.pendiente_aprobacion).length, 0);
  }

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    const idCoord = this.api.getCurrentUserId() ?? 0;
    let pendDone = false, evidDone = false;
    const checkDone = () => { if (pendDone && evidDone) { this.loading = false; this.cdr.detectChanges(); } };

    this.projectSvc.getPendientesAprobacion(idCoord, this.filterProyecto ?? undefined).subscribe({
      next: (d: any[]) => { this.tareasPendientes = d; pendDone = true; checkDone(); },
      error: () => { pendDone = true; checkDone(); },
    });

    this.projectSvc.getTareasCompletadas(idCoord, this.filterProyecto ?? undefined).subscribe({
      next: (d: any[]) => { this.tareasEvidencia = d; evidDone = true; checkDone(); },
      error: () => { evidDone = true; checkDone(); },
    });
  }

  // ── Aprobación individual de operario ─────────────────────────────────────

  aprobarParte(tarea: any, operario: any): void {
    const key = `${tarea.id}_${operario.id_usuario}`;
    this.approvingId = key;
    this.cdr.detectChanges();

    this.projectSvc.aprobarParteOperario(tarea.id, operario.id_usuario).subscribe({
      next: (res: any) => {
        this.approvingId = null;
        // Actualizar en memoria sin recargar todo
        operario.completado_en = new Date().toISOString();
        operario.pendiente_aprobacion = false;
        tarea.aprobados = res.aprobados ?? (tarea.aprobados + 1);
        tarea.porcentaje = res.porcentaje ?? tarea.porcentaje;

        if (res.en_revision) {
          // Todas las partes aprobadas — pasa a Evidencias/verificación, no se completa sola.
          this.tareasPendientes = this.tareasPendientes.filter((t: any) => t.id !== tarea.id);
          void Swal.fire({ icon: 'success', title: `¡Todas las partes aprobadas! (${tarea.nombre})`, text: 'Pasó a la pestaña Evidencias/verificación para su verificación final.', timer: 2500, showConfirmButton: false });
          this.loadAll();
        } else {
          void Swal.fire({ icon: 'success', title: 'Parte aprobada', text: `Progreso: ${res.porcentaje}%`, timer: 1400, showConfirmButton: false });
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.approvingId = null;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo aprobar', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // Todas las partes que quedan asignadas ya están aprobadas (puede pasar al desasignar al
  // último operario sin marcar mientras otro ya estaba aprobado) — nadie disparó el cierre
  // automático de aprobarParteOperario, así que se ofrece confirmarlo manualmente.
  completarTareaAprobada(tarea: any): void {
    void Swal.fire({
      title: '¿Pasar a verificación?',
      html: `Todas las partes de <b>${tarea.nombre}</b> ya están aprobadas. Pasará a Evidencias/verificación para su verificación final.`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Sí, continuar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#00A859',
    }).then(r => {
      if (!r.isConfirmed) return;
      this.completandoId = tarea.id;
      this.cdr.detectChanges();
      this.projectSvc.completarTareaAprobada(tarea.id).subscribe({
        next: () => {
          this.completandoId = null;
          this.tareasPendientes = this.tareasPendientes.filter((t: any) => t.id !== tarea.id);
          void Swal.fire({ icon: 'success', title: `¡Todas las partes aprobadas! (${tarea.nombre})`, text: 'Pasó a la pestaña Evidencias/verificación para su verificación final.', timer: 2500, showConfirmButton: false });
          this.loadAll();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.completandoId = null;
          void Swal.fire('Error', err?.error?.message ?? 'No se pudo completar', 'error');
          this.cdr.detectChanges();
        },
      });
    });
  }

  // ── Rechazar parte de operario ─────────────────────────────────────────────

  openRechazarModal(tarea: any, operario: any): void {
    this.rechazarTarea = tarea;
    this.rechazarOperario = operario;
    this.rechazarForm = {
      fecha_inicio: operario.fecha_inicio || this.today(),
      fecha_fin:    operario.fecha_fin || operario.fecha_inicio || this.today(),
      hora_inicio:  operario.hora_inicio || '07:00',
      hora_fin:     operario.hora_fin || '17:00',
      motivo: '',
    };
    this.showRechazarModal = true;
    this.cdr.detectChanges();
  }

  closeRechazarModal(): void {
    this.showRechazarModal = false;
    this.rechazarTarea = null;
    this.rechazarOperario = null;
    this.cdr.detectChanges();
  }

  submitRechazar(): void {
    if (!this.rechazarTarea || !this.rechazarOperario || !this.rechazarForm.fecha_inicio) return;
    this.rechazarSaving = true;
    const tarea = this.rechazarTarea;
    const operario = this.rechazarOperario;

    this.projectSvc.rechazarParteOperario(tarea.id, operario.id_usuario, {
      fecha_inicio: this.rechazarForm.fecha_inicio,
      fecha_fin:    this.rechazarForm.fecha_fin || this.rechazarForm.fecha_inicio,
      hora_inicio:  this.rechazarForm.hora_inicio,
      hora_fin:     this.rechazarForm.hora_fin,
      motivo:       this.rechazarForm.motivo,
    }).subscribe({
      next: () => {
        this.rechazarSaving = false;
        // Actualizar en memoria: vuelve a quedar pendiente de entregar, ya no de aprobar
        operario.marcado_en = null;
        operario.pendiente_aprobacion = false;
        operario.fecha_inicio = this.rechazarForm.fecha_inicio;
        operario.fecha_fin    = this.rechazarForm.fecha_fin || this.rechazarForm.fecha_inicio;
        operario.hora_inicio  = this.rechazarForm.hora_inicio;
        operario.hora_fin     = this.rechazarForm.hora_fin;
        void Swal.fire({ icon: 'success', title: 'Parte rechazada', text: 'Se notificó al operario con el nuevo horario.', timer: 1800, showConfirmButton: false });
        this.closeRechazarModal();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.rechazarSaving = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo rechazar la parte', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // ── Aprobación forzada ─────────────────────────────────────────────────────

  openForzadaModal(tarea: any): void {
    this.forzadaTarea = tarea;
    this.forzadaJustificacion = '';
    this.showForzadaModal = true;
    this.cdr.detectChanges();
  }

  closeForzadaModal(): void { this.showForzadaModal = false; this.forzadaTarea = null; this.cdr.detectChanges(); }

  submitForzada(): void {
    if (!this.forzadaTarea || !this.forzadaJustificacion.trim()) return;
    this.forzadaSaving = true;
    this.projectSvc.aprobarTareaForzada(this.forzadaTarea.id, this.forzadaJustificacion).subscribe({
      next: () => {
        this.forzadaSaving = false;
        this.tareasPendientes = this.tareasPendientes.filter((t: any) => t.id !== this.forzadaTarea!.id);
        void Swal.fire({ icon: 'success', title: 'Tarea completada (forzada)', timer: 1600, showConfirmButton: false });
        this.closeForzadaModal();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.forzadaSaving = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo completar', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // ── Evidence modal (legacy) ────────────────────────────────────────────────

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
        this.tareasEvidencia = this.tareasEvidencia.filter(t => t.id !== this.evidTarea!.id);
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
          this.tareasEvidencia = this.tareasEvidencia.filter(t => t.id !== tarea.id);
          void Swal.fire({ icon: 'success', title: 'Evidencia subida y tarea verificada', timer: 1800, showConfirmButton: false });
          this.closeEvidModal(); this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.evidSaving = false;
          void Swal.fire('Error', err?.error?.message ?? 'No se pudo completar', 'error');
          this.cdr.detectChanges();
        },
      });
    } else {
      verificar$.subscribe({
        next: () => {
          this.evidSaving = false;
          this.tareasEvidencia = this.tareasEvidencia.filter(t => t.id !== tarea.id);
          void Swal.fire({ icon: 'success', title: 'Tarea verificada y completada', timer: 1500, showConfirmButton: false });
          this.closeEvidModal(); this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.evidSaving = false;
          void Swal.fire('Error', err?.error?.message ?? 'No se pudo verificar', 'error');
          this.cdr.detectChanges();
        },
      });
    }
  }

  verificarTarea(t: any): void {
    void Swal.fire({
      title: '¿Verificar tarea?',
      html: `<b>${t.nombre}</b><br><small>¿Confirmas sin subir evidencia?</small>`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Sí, verificar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#00A859',
    }).then(r => {
      if (!r.isConfirmed) return;
      this.projectSvc.completarTarea(t.fase_id, t.id).subscribe({
        next: () => {
          this.tareasEvidencia = this.tareasEvidencia.filter(x => x.id !== t.id);
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


  // ── Helpers ───────────────────────────────────────────────────────────────

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  formatDateTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

}
