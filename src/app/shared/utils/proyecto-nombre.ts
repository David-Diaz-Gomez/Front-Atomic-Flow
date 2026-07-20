export function nombreProyecto(p: { codigo?: string | number | null; id?: number; nombre?: string } | null | undefined): string {
  if (!p) return '';
  const code = p.codigo ?? p.id ?? '';
  return code ? `#${code} ${p.nombre ?? ''}`.trim() : (p.nombre ?? '');
}
