import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Api } from '../../../core/services/api';

interface EvidenciaItem {
  id: number;
  url_imagen: string;
  descripcion: string;
  fecha_subida: string;
}

interface TareaEvidencia {
  id: number;
  nombre: string;
  fase: string;
  proyecto: string;
  proyecto_id: number;
  // Operario
  operario: string;
  id_operario: number;
  completado_en: string;
  // Coordinador
  coordinador: string;
  id_coordinador: number;
  evidencia_subida_en: string;
  // Evidencias
  evidencias: EvidenciaItem[];
  // UI
  expanded: boolean;
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-director-evidencias',
  standalone: false,
  templateUrl: './evidencias.html',
  styleUrl: './evidencias.scss',
})
export class DirectorEvidencias implements OnInit {
  tareas: TareaEvidencia[] = [];
  loading = true;
  lightboxImg: string | null = null;

  constructor(private api: Api, private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.loadEvidencias(); }

  loadEvidencias(): void {
    this.loading = true;
    const idDirector = this.api.getCurrentUserId() ?? 0;
    const params = new HttpParams().set('id_director', String(idDirector));
    this.http.get<any>(`${this.api.baseUrl}/director/evidencias`, { params }).subscribe({
      next: (r: any) => {
        this.tareas = r?.data ?? r ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.tareas = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  toggleExpand(t: TareaEvidencia): void { t.expanded = !t.expanded; this.cdr.detectChanges(); }

  openLightbox(url: string): void { this.lightboxImg = url; this.cdr.detectChanges(); }
  closeLightbox(): void           { this.lightboxImg = null; this.cdr.detectChanges(); }

  fmt(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  minutosEntre(a: string, b: string): string {
    if (!a || !b) return '';
    const diff = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
    if (diff < 60)  return `${diff} min después`;
    return `${Math.round(diff / 60)} h después`;
  }
}
