// Genera assets/tecnologias.svg: los lenguajes de los repositorios públicos del perfil, con una barra
// proporcional y una leyenda en dos columnas. Lo ejecuta la GitHub Action .github/workflows/tecnologias.yml.
//
//   GITHUB_TOKEN=... USUARIO=Corinaast node scripts/tecnologias.mjs
//
// Variables opcionales:
//   TITULO              título de la tarjeta (por defecto "Technology Footprint")
//   CANTIDAD            cuántos lenguajes mostrar (por defecto 6)
//   EXCLUIR_REPOS       repositorios a ignorar, separados por coma
//   OCULTAR_LENGUAJES   lenguajes a ignorar, separados por coma
import { mkdirSync, writeFileSync } from 'node:fs';

const USUARIO = process.env.USUARIO || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;
const TITULO = process.env.TITULO || 'Technology Footprint';
const CANTIDAD = Number(process.env.CANTIDAD || 6);
const lista = v => new Set((v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
const EXCLUIR = lista(process.env.EXCLUIR_REPOS);
const OCULTAR = lista(process.env.OCULTAR_LENGUAJES);
if (!USUARIO) throw new Error('Falta USUARIO');

// Colores oficiales de GitHub (linguist). Si no se puede descargar la tabla, se usan estos.
const COLORES_BASE = {
  Java: '#b07219', JavaScript: '#f1e05a', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#663399', Python: '#3572A5',
  Go: '#00ADD8', Dockerfile: '#384d54', Shell: '#89e051', 'C++': '#f34b7d', C: '#555555', SCSS: '#c6538c',
  Batchfile: '#C1F12E', PLpgSQL: '#336790', Kotlin: '#A97BFF', Vue: '#41b883', 'Jupyter Notebook': '#DA5B0B',
};

async function api(ruta) {
  const r = await fetch(`https://api.github.com${ruta}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'tecnologias-perfil', ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }) },
  });
  if (!r.ok) throw new Error(`GitHub API ${ruta}: ${r.status}`);
  return r.json();
}

async function colores() {
  try {
    const r = await fetch('https://raw.githubusercontent.com/ozh/github-colors/master/colors.json');
    const datos = await r.json();
    return Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.color]).filter(([, c]) => c));
  } catch {
    return {};
  }
}

// Estilos en atributos (no en <style>) para que la tarjeta se vea igual en cualquier visor de SVG.
const FUENTE = `font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif"`;
const escapar = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function dibujar(lenguajes, titulo) {
  const ancho = 495, x0 = 25, anchoBarra = ancho - 2 * x0;
  const filas = Math.ceil(lenguajes.length / 2);
  const alto = Math.max(195, 95 + filas * 25);   // 195 = alto de la tarjeta de rachas, para que queden alineadas
  let x = x0;
  const segmentos = lenguajes.map(l => {
    const w = (anchoBarra * l.porcentaje) / 100;
    const seg = `<rect x="${x.toFixed(2)}" y="58" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
    x += w;
    return seg;
  }).join('');
  const leyenda = lenguajes.map((l, i) => {
    const col = i % 2, fila = Math.floor(i / 2);
    const lx = x0 + col * 220, ly = 98 + fila * 25;
    return `<g transform="translate(${lx} ${ly})"><circle cx="5" cy="-4" r="5" fill="${l.color}"/>` +
      `<text x="16" y="0" ${FUENTE} font-size="12" fill="#c9d1d9">${escapar(l.nombre)} ${l.porcentaje.toFixed(2)}%</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="${escapar(titulo)}">
<title>${escapar(titulo)}: ${lenguajes.map(l => `${escapar(l.nombre)} ${l.porcentaje.toFixed(2)}%`).join(', ')}</title>
<rect x="0.5" y="0.5" width="${ancho - 1}" height="${alto - 1}" rx="6" fill="#0d1117" stroke="#30363d"/>
<text x="${x0}" y="38" ${FUENTE} font-size="18" font-weight="600" fill="#ffffff">${escapar(titulo)}</text>
<clipPath id="barra"><rect x="${x0}" y="58" width="${anchoBarra}" height="8" rx="4"/></clipPath>
<rect x="${x0}" y="58" width="${anchoBarra}" height="8" rx="4" fill="#21262d"/>
<g clip-path="url(#barra)">${segmentos}</g>
${leyenda}
</svg>
`;
}

async function main() {
  const repos = [];
  for (let pagina = 1; ; pagina++) {
    const lote = await api(`/users/${USUARIO}/repos?type=owner&per_page=100&page=${pagina}`);
    repos.push(...lote);
    if (lote.length < 100) break;
  }
  const elegidos = repos.filter(r => !r.fork && r.name.toLowerCase() !== USUARIO.toLowerCase() && !EXCLUIR.has(r.name.toLowerCase()));
  const bytes = {};
  for (const r of elegidos) {
    for (const [lenguaje, n] of Object.entries(await api(`/repos/${r.full_name}/languages`))) {
      if (!OCULTAR.has(lenguaje.toLowerCase())) bytes[lenguaje] = (bytes[lenguaje] || 0) + n;
    }
  }
  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  if (!total) throw new Error('No se encontraron lenguajes en los repositorios públicos');
  const paleta = { ...COLORES_BASE, ...(await colores()) };
  const top = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, CANTIDAD);
  const totalTop = top.reduce((a, [, n]) => a + n, 0);
  // Como en las tarjetas de GitHub Readme Stats: los porcentajes se calculan entre los lenguajes mostrados.
  const lenguajes = top.map(([nombre, n]) => ({ nombre, porcentaje: (100 * n) / totalTop, color: paleta[nombre] || '#8b949e' }));
  mkdirSync('assets', { recursive: true });
  writeFileSync('assets/tecnologias.svg', dibujar(lenguajes, TITULO));
  console.log(`${elegidos.length} repositorios analizados:`, lenguajes.map(l => `${l.nombre} ${l.porcentaje.toFixed(2)}%`).join(', '));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('tecnologias.mjs')) main();
