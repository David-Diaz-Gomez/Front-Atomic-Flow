import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import Swal from 'sweetalert2';
import { Api } from '../../../core/services/api';
import { ProjectService } from '../../../shared/services/project.service';

interface PedidoItem {
  id: number;
  id_pedido: number;
  id_detalle_recurso: number;
  cantidad: number;
  valor_unitario: number;
  observacion: string | null;
  nombre_recurso: string;
  observaciones_recurso: string | null;
}

interface Pedido {
  id: number;
  fecha_compra: string | null;
  fecha_requerida: string;
  fecha_solicitud: number;
  cantidad_recibida: number;
  cantidad_solicitada: number;
  proveedor: string;
  valor: number;
  detalle: string | null;
  id_estado_pedido: number;
  estado: string;
  id_proyecto: number;
  nombre_proyecto: string;
  centro_costos: string;
  estado_proyecto: string;
  items: PedidoItem[];
}

interface ProyectoGroup {
  id_proyecto: number;
  nombre_proyecto: string;
  centro_costos: string;
  estado_proyecto: string;
  pedidos: Pedido[];
  expanded: boolean;
}

interface RecursoOption {
  id_detalle_recurso: number;
  nombre: string;
}

interface FormItem {
  id_detalle_recurso: number | null;
  cantidad: number | null;
  valor_unitario: number | null;
  observacion: string;
}

interface ExtraValor {
  motivo: string;
  monto: number | null;
}

interface HistoricoDetalleItem {
  id: number;
  id_historico: number;
  id_detalle_pedido_recurso: number;
  cantidad_recibida: number;
  cantidad_pedida: number;
  valor_unitario: number;
  nombre_recurso: string;
  observaciones_recurso: string | null;
}

interface HistoricoEntrada {
  id: number;
  fecha_recibido: string;
  cantidad_recibida: number;
  observaciones: string;
  estado: number;
  items: HistoricoDetalleItem[];
}

interface EntregaFormItem {
  id_detalle_pedido_recurso: number;
  nombre_recurso: string;
  cantidad_pedida: number;
  cantidad_recibida: number | null;
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const ESTADOS_PEDIDO = [
  { id: 1, label: 'Compra Realizada' },
  { id: 2, label: 'Pedido en Bodega Completo' },
  { id: 3, label: 'Pedido en Bodega Incompleto' },
  { id: 4, label: 'Solicitud Pedido' },
];

@Component({
  selector: 'app-estados-compra',
  standalone: false,
  templateUrl: './estados-compra.html',
  styleUrls: ['./estados-compra.scss'],
})
export class EstadosCompra implements OnInit {
  allPedidos: Pedido[] = [];
  grupos: ProyectoGroup[] = [];
  gruposFiltrados: ProyectoGroup[] = [];

  loading = true;
  filterSearch = '';
  filterEstado = '';

  page = 1;
  totalPages = 1;
  total = 0;

  estadosPedido = ESTADOS_PEDIDO;

  // ── Modal crear ───────────────────────────────────────────────────────────
  showModal = false;
  saving = false;
  submitted = false;

  // ── Modal historial ───────────────────────────────────────────────────────
  showHistorialModal = false;
  historialPedido: Pedido | null = null;
  historialEntradas: HistoricoEntrada[] = [];
  historialLoading = false;

  showEntregaForm = false;
  savingEntrega = false;
  entregaForm: { fecha_recibido: string; observaciones: string; items: EntregaFormItem[] } = {
    fecha_recibido: '',
    observaciones: '',
    items: [],
  };

  // ── Modal editar ──────────────────────────────────────────────────────────
  showEditModal = false;
  editingPedido: Pedido | null = null;
  updating = false;
  updateForm = {
    fecha_compra: '',
  };

  proyectos: any[] = [];
  proyectosFiltrados: any[] = [];
  proyectoSearch = '';
  showProyectoDropdown = false;

  recursos: RecursoOption[] = [];
  loadingRecursos = false;

  form = {
    id_proyecto:     null as number | null,
    proveedor:       '',
    fecha_solicitud: '',
    fecha_requerida: '',
    detalle:         '',
    items:           [] as FormItem[],
    extras:          [] as ExtraValor[],
  };

  get baseValor(): number {
    return this.form.items.reduce((sum, i) =>
      sum + (Number(i.cantidad) || 0) * (Number(i.valor_unitario) || 0), 0);
  }

  get calculatedValor(): number {
    const extrasTotal = this.form.extras.reduce((sum, e) => sum + (Number(e.monto) || 0), 0);
    return this.baseValor + extrasTotal;
  }

  get autoDetalle(): string | null {
    if (!this.form.extras.length) return null;
    return this.form.extras
      .map(e => `${e.motivo}: ${this.fmtMoney(Number(e.monto) || 0)}`)
      .join(' | ');
  }

  get combinedDetalle(): string {
    return [this.form.detalle?.trim(), this.autoDetalle]
      .filter(s => s && s.trim())
      .join('\n');
  }

  get stats() {
    const list = this.allPedidos.filter(p => p.id_estado_pedido !== 5);
    return {
      total:     list.length,
      solicitud: list.filter(p => p.id_estado_pedido === 4).length,
      parcial:   list.filter(p => p.id_estado_pedido === 3).length,
      completo:  list.filter(p => p.id_estado_pedido === 2).length,
    };
  }

  get formErrors(): Record<string, string> {
    const f = this.form;
    const e: Record<string, string> = {};

    if (!f.id_proyecto)
      e['proyecto'] = 'Selecciona un proyecto';
    if (!f.proveedor.trim())
      e['proveedor'] = 'El proveedor es obligatorio';
    if (!f.fecha_solicitud)
      e['fecha_solicitud'] = 'Campo obligatorio';
    if (!f.fecha_requerida)
      e['fecha_requerida'] = 'Campo obligatorio';
    if (f.fecha_solicitud && f.fecha_requerida && f.fecha_solicitud > f.fecha_requerida)
      e['fecha_rango'] = 'La fecha de solicitud no puede ser posterior a la fecha requerida';
    if (f.items.length === 0)
      e['items'] = 'Agrega al menos un recurso al pedido';

    f.items.forEach((item, i) => {
      if (!item.id_detalle_recurso)        e[`item_r_${i}`] = 'Selecciona un recurso';
      if (!item.cantidad || item.cantidad <= 0) e[`item_c_${i}`] = 'Cantidad requerida';
      if (item.valor_unitario === null || item.valor_unitario < 0) e[`item_v_${i}`] = 'Valor inválido';
    });

    f.extras.forEach((ex, i) => {
      if (!ex.motivo.trim())            e[`extra_m_${i}`] = 'El motivo es obligatorio';
      if (!ex.monto || ex.monto <= 0)   e[`extra_v_${i}`] = 'Ingresa un monto mayor a 0';
    });

    return e;
  }

  get isFormValid(): boolean {
    return Object.keys(this.formErrors).length === 0;
  }

  constructor(
    private api: Api,
    private projectSvc: ProjectService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.api.getPedidos(this.page).subscribe({
      next: (res: any) => {
        this.allPedidos = res.data ?? [];
        this.total      = res.total ?? 0;
        this.totalPages = res.totalPages ?? 1;
        this.buildGroups();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.allPedidos = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  buildGroups(): void {
    const map = new Map<number, ProyectoGroup>();
    for (const p of this.allPedidos) {
      if (!map.has(p.id_proyecto)) {
        map.set(p.id_proyecto, {
          id_proyecto:     p.id_proyecto,
          nombre_proyecto: p.nombre_proyecto,
          centro_costos:   p.centro_costos,
          estado_proyecto: p.estado_proyecto,
          pedidos:         [],
          expanded:        true,
        });
      }
      map.get(p.id_proyecto)!.pedidos.push(p);
    }
    this.grupos = Array.from(map.values());
    this.applyFilters();
  }

  applyFilters(): void {
    const search = this.filterSearch.toLowerCase().trim();
    const estado = this.filterEstado;

    this.gruposFiltrados = this.grupos
      .map(g => {
        const pedidos = g.pedidos.filter(p => {
          const matchEstado = estado
            ? String(p.id_estado_pedido) === estado
            : p.id_estado_pedido !== 5;

          const matchSearch = !search ||
            p.nombre_proyecto.toLowerCase().includes(search) ||
            p.proveedor.toLowerCase().includes(search) ||
            (p.detalle ?? '').toLowerCase().includes(search) ||
            p.items.some(i => i.nombre_recurso.toLowerCase().includes(search));

          return matchEstado && matchSearch;
        });
        return { ...g, pedidos };
      })
      .filter(g => g.pedidos.length > 0);

    this.cdr.detectChanges();
  }

  toggleGrupo(g: ProyectoGroup): void {
    g.expanded = !g.expanded;
    this.cdr.detectChanges();
  }

  goPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.load();
  }

  // ── Modal crear ───────────────────────────────────────────────────────────

  openModal(): void {
    this.submitted = false;
    this.form = {
      id_proyecto: null,
      proveedor: '',
      fecha_solicitud: '',
      fecha_requerida: '',
      detalle: '',
      items: [],
      extras: [],
    };
    this.recursos = [];
    this.proyectoSearch = '';
    this.showProyectoDropdown = false;
    this.showModal = true;

    if (!this.proyectos.length) {
      this.projectSvc.getProjects({ aprobado: 'true', limit: 100 }).subscribe({
        next: r => {
          this.proyectos = r.data ?? [];
          this.proyectosFiltrados = this.proyectos;
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    } else {
      this.proyectosFiltrados = this.proyectos;
    }
  }

  closeModal(): void { this.showModal = false; }

  onProyectoSearchInput(): void {
    const q = this.proyectoSearch.toLowerCase().trim();
    this.proyectosFiltrados = q
      ? this.proyectos.filter(p => p.nombre.toLowerCase().includes(q))
      : this.proyectos;
    this.showProyectoDropdown = true;
    this.cdr.detectChanges();
  }

  selectProyecto(p: any): void {
    this.form.id_proyecto = p.id;
    this.proyectoSearch   = p.nombre;
    this.showProyectoDropdown = false;
    this.onProyectoChange();
  }

  blurProyecto(): void {
    setTimeout(() => { this.showProyectoDropdown = false; this.cdr.detectChanges(); }, 150);
  }

  onProyectoChange(): void {
    this.recursos = [];
    this.form.items = [];
    if (!this.form.id_proyecto) return;

    this.loadingRecursos = true;
    this.api.getRecursosParaPedido(this.form.id_proyecto).subscribe({
      next: (list) => {
        this.recursos = list.map(r => {
          const obs = r.observaciones;
          const esJson = obs ? (() => { try { JSON.parse(obs); return true; } catch { return false; } })() : false;
          const label = obs && !esJson ? `${r.nombre_recurso} — ${obs}` : r.nombre_recurso;
          return { id_detalle_recurso: r.id_detalle_recurso, nombre: label };
        });
        this.loadingRecursos = false;
        this.addItem();
        this.cdr.detectChanges();
      },
      error: () => { this.loadingRecursos = false; this.cdr.detectChanges(); },
    });
  }

  // ── Items ────────────────────────────────────────────────────────────────

  addItem(): void {
    this.form.items.push({ id_detalle_recurso: null, cantidad: null, valor_unitario: null, observacion: '' });
    this.cdr.detectChanges();
  }

  removeItem(index: number): void {
    this.form.items.splice(index, 1);
    this.cdr.detectChanges();
  }

  addExtra(): void {
    this.form.extras.push({ motivo: '', monto: null });
    this.cdr.detectChanges();
  }

  removeExtra(index: number): void {
    this.form.extras.splice(index, 1);
    this.cdr.detectChanges();
  }

  submitForm(): void {
    this.submitted = true;
    this.cdr.detectChanges();
    if (!this.isFormValid) return;
    const f = this.form;

    this.saving = true;
    this.api.createPedido({
      fecha_requerida: f.fecha_requerida,
      fecha_solicitud: this.dateToInt(f.fecha_solicitud),
      proveedor:       f.proveedor,
      valor:           this.calculatedValor,
      detalle:         [f.detalle, this.autoDetalle].filter(s => s && s.trim()).join(' | ') || null,
      items: f.items.map(i => ({
        id_detalle_recurso: i.id_detalle_recurso!,
        cantidad:           i.cantidad!,
        valor_unitario:     i.valor_unitario!,
        observacion:        i.observacion || null,
      })),
    }).subscribe({
      next: () => {
        this.saving = false;
        this.showModal = false;
        this.page = 1;
        this.load();
      },
      error: () => { this.saving = false; this.cdr.detectChanges(); },
    });
  }

  // ── Modal historial ───────────────────────────────────────────────────────

  openHistorial(p: Pedido): void {
    this.historialPedido = p;
    this.historialEntradas = [];
    this.historialLoading = true;
    this.showHistorialModal = true;
    this.showEntregaForm = false;
    this.entregaForm = {
      fecha_recibido: '',
      observaciones: '',
      items: p.items.map(i => ({
        id_detalle_pedido_recurso: i.id,
        nombre_recurso: this.labelRecursoItem(i),
        cantidad_pedida: i.cantidad,
        cantidad_recibida: null,
      })),
    };
    this.cdr.detectChanges();
    this.loadHistorial(p.id);
  }

  private loadHistorial(idPedido: number): void {
    this.historialLoading = true;
    this.api.getHistoricoPedido(idPedido).subscribe({
      next: (rows: any[]) => {
        this.historialEntradas = rows as HistoricoEntrada[];
        this.historialLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.historialLoading = false; this.cdr.detectChanges(); },
    });
  }

  closeHistorial(): void {
    this.showHistorialModal = false;
    this.historialPedido = null;
    this.showEntregaForm = false;
  }

  get historialProgreso(): number {
    const p = this.historialPedido;
    if (!p || !p.cantidad_solicitada) return 0;
    return Math.min(100, Math.round((p.cantidad_recibida / p.cantidad_solicitada) * 100));
  }

  submitEntrega(): void {
    if (!this.historialPedido) return;

    if (!this.entregaForm.fecha_recibido) {
      Swal.fire({ icon: 'warning', title: 'Fecha requerida', text: 'Debes ingresar la fecha de entrega', confirmButtonColor: '#3085d6' });
      return;
    }

    const items = this.entregaForm.items
      .filter(i => (Number(i.cantidad_recibida) || 0) > 0)
      .map(i => ({ id_detalle_pedido_recurso: i.id_detalle_pedido_recurso, cantidad_recibida: Number(i.cantidad_recibida!) }));

    if (!items.length) {
      Swal.fire({ icon: 'warning', title: 'Sin cantidades', text: 'Ingresa al menos una cantidad mayor a 0', confirmButtonColor: '#3085d6' });
      return;
    }

    this.savingEntrega = true;
    this.api.crearHistoricoPedido({
      fecha_recibido: this.entregaForm.fecha_recibido,
      observaciones:  this.entregaForm.observaciones,
      id_pedido:      this.historialPedido.id,
      items,
    }).subscribe({
      next: (data: any) => {
        this.savingEntrega = false;
        this.showEntregaForm = false;

        const pedido = this.allPedidos.find(p => p.id === this.historialPedido!.id);
        if (pedido && data) {
          pedido.cantidad_recibida = data.cantidad_recibida_pedido;
          pedido.id_estado_pedido  = data.id_estado_pedido;
          const ep = ESTADOS_PEDIDO.find(e => e.id === data.id_estado_pedido);
          if (ep) pedido.estado = ep.label;
          this.historialPedido = { ...pedido };
          this.buildGroups();
        }

        this.loadHistorial(this.historialPedido!.id);
      },
      error: () => { this.savingEntrega = false; this.cdr.detectChanges(); },
    });
  }

  // ── Modal editar ──────────────────────────────────────────────────────────

  openEditModal(p: Pedido): void {
    this.editingPedido = p;
    this.updateForm = {
      fecha_compra: p.fecha_compra ? p.fecha_compra.substring(0, 10) : '',
    };
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingPedido = null;
  }

  submitUpdate(): void {
    if (!this.editingPedido) return;
    this.updating = true;

    const body: any = { fecha_compra: this.updateForm.fecha_compra || null };
    if (this.updateForm.fecha_compra) body.id_estado_pedido = 1;

    this.api.updatePedido(this.editingPedido.id, body).subscribe({
      next: () => {
        this.updating = false;
        this.showEditModal = false;
        this.load();
      },
      error: () => { this.updating = false; this.cdr.detectChanges(); },
    });
  }

  confirmarInhabilitar(): void {
    if (!this.editingPedido) return;
    Swal.fire({
      title: '¿Inhabilitar pedido?',
      text: 'El pedido quedará inhabilitado y no aparecerá en la consulta.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e53e3e',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Sí, inhabilitar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (!result.isConfirmed || !this.editingPedido) return;
      this.updating = true;
      this.api.inhabilitarPedido(this.editingPedido.id).subscribe({
        next: () => {
          this.updating = false;
          this.showEditModal = false;
          this.load();
        },
        error: () => { this.updating = false; this.cdr.detectChanges(); },
      });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private dateToInt(dateStr: string): number {
    return parseInt(dateStr.replace(/-/g, ''), 10);
  }

  fmtFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  fmtFechaSolicitud(n: number): string {
    if (!n) return '—';
    const s = String(n);
    const y = s.slice(0, 4), m = Number(s.slice(4, 6)) - 1, d = s.slice(6, 8);
    return `${Number(d)} ${MONTHS[m]} ${y}`;
  }

  fmtMoney(v: string | number): string {
    return Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  }

  estadoClass(id: number): string {
    return ({
      1: 'badge-compra',
      2: 'badge-completo',
      3: 'badge-parcial',
      4: 'badge-solicitud',
      5: 'badge-inhabilitado',
    } as any)[id] ?? 'badge-default';
  }

  labelRecursoItem(item: PedidoItem): string {
    const obs = item.observaciones_recurso;
    if (!obs) return item.nombre_recurso;
    try { JSON.parse(obs); return item.nombre_recurso; } catch { /* no es JSON */ }
    return `${item.nombre_recurso} — ${obs}`;
  }

  labelHistoricoItem(item: HistoricoDetalleItem): string {
    const obs = item.observaciones_recurso;
    if (!obs) return item.nombre_recurso;
    try { JSON.parse(obs); return item.nombre_recurso; } catch { /* no es JSON */ }
    return `${item.nombre_recurso} — ${obs}`;
  }

  estadoProyectoLabel(e: string): string {
    return ({ en_produccion: 'En Producción', en_revision: 'En Revisión', aprobado: 'Aprobado', completado: 'Completado', borrador: 'Borrador' } as any)[e] ?? e;
  }
}
