// Построение LP-текста как fallback (если Python недоступен).
// Точная копия функции showLPText() из эталона.

export function buildLpTextLocal(graph) {
  const varNodes = (graph.nodes || []).filter(n => n.type === 'variable');
  const conNodes = (graph.nodes || []).filter(n => n.type === 'constraint');
  const varIdx = {};
  varNodes.forEach((v, i) => { varIdx[v.id] = i; });

  const adj = {};
  (graph.edges || []).forEach(e => {
    if (!adj[e.target]) adj[e.target] = [];
    if (varIdx[e.source] !== undefined) {
      adj[e.target].push({
        idx:   varIdx[e.source],
        coeff: e.coeff ?? 1,
        name:  varNodes[varIdx[e.source]].name,
      });
    }
  });

  const lines = [];
  lines.push(graph.direction === 'min' ? 'Minimize' : 'Maximize');
  const terms = varNodes.map(v => `${v.obj_coeff >= 0 ? '+' : ''}${v.obj_coeff} ${v.name}`).join(' ');
  lines.push('  obj: ' + terms);
  lines.push('');
  lines.push('Subject To');
  conNodes.forEach(c => {
    const rowT = (adj[c.id] || []).map(e => `${e.coeff >= 0 ? '+' : ''}${e.coeff} ${e.name}`).join(' ');
    const sense = { leq: '<=', geq: '>=', eq: '=' }[c.sense] || '<=';
    lines.push(`  ${c.name}: ${rowT} ${sense} ${c.rhs}`);
  });
  lines.push('');
  lines.push('Bounds');
  varNodes.forEach(v => lines.push(`  ${v.lb ?? 0} <= ${v.name} <= ${v.ub ?? '+inf'}`));
  lines.push('');
  const intVars = varNodes.filter(v => v.var_type === 'int').map(v => v.name);
  const binVars = varNodes.filter(v => v.var_type === 'binary').map(v => v.name);
  if (intVars.length) { lines.push('Generals'); intVars.forEach(n => lines.push('  ' + n)); }
  if (binVars.length) { lines.push('Binaries'); binVars.forEach(n => lines.push('  ' + n)); }
  lines.push('End');
  return lines.join('\n');
}
