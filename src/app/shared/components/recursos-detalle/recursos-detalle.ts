import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';

interface ResourceRow {
  id: number; nombre: string; observaciones: string;
  nombre_proveedor?: string | null; precio_unitario: number;
  cantidad: number; valor_total: number; mueble_nombre?: string | null;
}
interface CarpRow extends ResourceRow {
  laminado: boolean; mdf: boolean; madera: boolean; enchapado: boolean;
  formica: boolean; chapilla: boolean; tapiz: boolean;
  pintura_cat: boolean; pintura_pu: boolean;
  ancho: number; alto: number; fondo: number;
}
interface ImpRow extends ResourceRow {
  proveedor: string; ancho_m: number; alto_m: number;
  calibre: number; c: number; m: number; y: number; k: number; m2_vinilo: number;
}
interface Budget {
  materia_prima: ResourceRow[]; proveedores: ResourceRow[];
  carpinteria: CarpRow[]; impresiones: ImpRow[]; mano_de_obra: ResourceRow[];
}

const EMPTY_BUDGET = (): Budget => ({
  materia_prima: [], proveedores: [], carpinteria: [], impresiones: [], mano_de_obra: [],
});

@Component({
  selector: 'app-recursos-detalle',
  standalone: false,
  templateUrl: './recursos-detalle.html',
  styleUrl: './recursos-detalle.scss',
})
export class RecursosDetalle implements OnChanges {
  @Input() recursos: any = null;
  @Input() mostrarPrecios = true;
  @Input() mostrarPedido = false;
  @Input() orderedIds: Set<number> = new Set();
  @Output() pedirRecurso = new EventEmitter<{ id: number; nombre: string; nombre_proveedor?: string | null; precio_unitario: number; cantidad: number }>();

  budget: Budget = EMPTY_BUDGET();
  activeSection = 'materia_prima';

  ngOnChanges(): void {
    this.budget = this.recursos ? this.mapToBudget(this.recursos) : EMPTY_BUDGET();
  }

  setSection(s: string): void { this.activeSection = s; }

  sectionTotal(section: keyof Budget): number {
    return (this.budget[section] as ResourceRow[]).reduce((s, r) => s + (r.valor_total ?? 0), 0);
  }

  grandTotal(): number {
    return (['materia_prima', 'proveedores', 'carpinteria', 'impresiones', 'mano_de_obra'] as (keyof Budget)[])
      .reduce((s, k) => s + this.sectionTotal(k), 0);
  }

  get hasData(): boolean {
    return (['materia_prima', 'proveedores', 'carpinteria', 'impresiones', 'mano_de_obra'] as (keyof Budget)[])
      .some(k => this.budget[k].length > 0);
  }

  formatCOP(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v ?? 0);
  }

  carpMaterials(row: CarpRow): string {
    const m: string[] = [];
    if (row.laminado)    m.push('Laminado');
    if (row.mdf)         m.push('MDF');
    if (row.madera)      m.push('Madera');
    if (row.enchapado)   m.push('Enchapado');
    if (row.formica)     m.push('Formica');
    if (row.chapilla)    m.push('Chapilla');
    if (row.tapiz)       m.push('Tapiz');
    if (row.pintura_cat) m.push('P.Cat');
    if (row.pintura_pu)  m.push('P.PU');
    return m.join(', ') || '—';
  }

  private mapToBudget(data: any): Budget {
    const budget = EMPTY_BUDGET();
    const cats: any[] = Array.isArray(data)
      ? data
      : (data?.categorias ?? data?.grupos ?? data?.secciones ?? []);

    for (const cat of cats) {
      const rawTipo = (typeof cat.tipo === 'string' ? cat.tipo : '')
        || cat.tipo_recurso?.nombre || cat.nombre || cat.label || '';
      const tipo = rawTipo.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_');
      const rawItems: any[] = cat.items ?? cat.recursos ?? cat.data ?? [];

      const items = rawItems.map((r: any) => ({
        id:              r.id ?? r.id_detalle_recurso,
        nombre:          r.recurso?.nombre || r.nombre || r.observaciones || '',
        observaciones:   r.observaciones ?? '',
        nombre_proveedor: r.nombre_proveedor ?? null,
        precio_unitario: r.valor_unitario ?? 0,
        cantidad:        r.cantidad ?? 0,
        valor_total:     r.valor_total ?? 0,
        mueble_nombre:   r.mueble?.nombre ?? null,
        laminado:    r.laminado    ?? false, mdf:         r.mdf         ?? false,
        madera:      r.madera      ?? false, enchapado:   r.enchapado   ?? false,
        formica:     r.formica     ?? false, chapilla:    r.chapilla    ?? false,
        tapiz:       r.tapiz       ?? false, pintura_cat: r.pintura_cat ?? false,
        pintura_pu:  r.pintura_pu  ?? false,
        ancho:     r.ancho_cm ?? r.ancho ?? 0,
        alto:      r.alto_cm  ?? r.alto  ?? 0,
        fondo:     r.fondo_cm ?? r.fondo ?? 0,
        proveedor: r.proveedor ?? '',
        calibre:   r.calibre  ?? 0,
        c: r.c ?? 0, m: r.m ?? 0, y: r.y ?? 0, k: r.k ?? 0,
        ancho_m:   r.ancho_m  ?? 0,
        alto_m:    r.alto_m   ?? 0,
        m2_vinilo: r.m2_vinilo ?? parseFloat(((r.ancho_m ?? 0) * (r.alto_m ?? 0)).toFixed(4)),
      }));

      if (tipo === 'materia_prima')   budget.materia_prima = items;
      else if (tipo === 'proveedores') budget.proveedores  = items;
      else if (tipo.includes('carpinteria') || tipo.includes('carpinter'))
                                       budget.carpinteria  = items as CarpRow[];
      else if (tipo === 'impresiones') budget.impresiones  = items as ImpRow[];
      else if (tipo === 'mano_de_obra') budget.mano_de_obra = items;
    }
    return budget;
  }
}
