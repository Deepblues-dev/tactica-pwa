// ════════════════════════════════════════════════════════════
// ui.js — Renderizado, filtros, toast y helpers de capas
// Depende de: config.js, auth.js
// ════════════════════════════════════════════════════════════

// ── Toast ─────────────────────────────────────────────────
function toast(mensaje, tipo = 'success', duracion = 3500) {
    const iconos  = { success: 'check_circle', error: 'error', warning: 'warning' };
    const div     = document.createElement('div');
    div.className = `toast-msg ${tipo}`;
    div.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;">${iconos[tipo]}</span>${mensaje}`;
    document.getElementById('toast-container').appendChild(div);
    setTimeout(() => div.remove(), duracion);
}

// ── Helpers de texto ──────────────────────────────────────
function normalizar(texto) {
    return (texto || '').toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

async function generarHash(data) {
    const bytes  = new TextEncoder().encode(JSON.stringify(data));
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseFecha(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') return 0;
    fechaStr = fechaStr.trim().toLowerCase()
        .replace(',', '')
        .replace('a. m.', 'am').replace('p. m.', 'pm')
        .replace('a.m.', 'am').replace('p.m.', 'pm');

    const match = fechaStr.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/
    );
    if (!match) return 0;

    let [, dia, mes, anio, h=0, m=0, s=0, periodo=''] = match;
    [dia, mes, anio, h, m, s] = [dia, mes, anio, h, m, s].map(Number);
    mes -= 1;
    if (periodo === 'pm' && h < 12) h += 12;
    if (periodo === 'am' && h === 12) h = 0;
    return new Date(anio, mes, dia, h, m, s).getTime();
}

// ── Helpers de capas ─────────────────────────────────────
function tieneAccesoPrivado() {
    return !!(App.accessToken && tokenVigente());
}

function campo(f, idx) {
    if (CAPAS.ocultos.includes(idx))      return null;
    if (CAPAS.publica.includes(idx))      return f[idx] || null;
    if (CAPAS.privadaMovil.includes(idx)) {
        return tieneAccesoPrivado() ? (f[idx] || null) : '--- Validar Credenciales ---';
    }
    return null;
}

// ── Visibilidad del botón Nuevo Expediente ────────────────
// Solo visible en PC/MAC + online + token válido
function actualizarVisibilidadBtnNuevo() {
    const btn        = document.getElementById('btn-add-nav');
    const esMovil    = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const esMac      = /Macintosh|Windows|Linux/i.test(navigator.userAgent) && !esMovil;
    const puedeAgregar = esMac && navigator.onLine && tieneAccesoPrivado();

    if (btn) btn.style.display = puedeAgregar ? '' : 'none';
}

// ── Filtros ───────────────────────────────────────────────
function prepararFiltros() {
    const datos    = App.rawData.slice(1);
    const clientes = [...new Set(datos.map(f => f[4]))].filter(Boolean).sort();
    document.getElementById('sel-cliente').innerHTML =
        '<option value="">-- Todos los Clientes --</option>' +
        clientes.map(c => `<option value="${c}">${c}</option>`).join('');
}

window.toggleCapas = function (tipo) {
    const tipos = ['cliente', 'fuero', 'exp'];
    const btnActivo = document.getElementById(`btn-f-${tipo}`);
    const yaActivo  = btnActivo.classList.contains('activo');

    tipos.forEach(t => {
        document.getElementById(`btn-f-${t}`).classList.remove('activo');
        document.getElementById(`capa-${t}`).style.display = 'none';
    });
    limpiarSubFiltros();
    document.getElementById('busqG').value = '';
    document.getElementById('area-filtros').style.display = 'none';

    if (!yaActivo) {
        btnActivo.classList.add('activo');
        document.getElementById(`capa-${tipo}`).style.display = 'block';
        document.getElementById('area-filtros').style.display = 'block';
    }
    window.aplicarFiltroFinal();
};

window.logicFuero = function () {
    const fuero    = document.getElementById('sel-fuero').value;
    const selLugar = document.getElementById('sel-lugar');
    if (!fuero) {
        selLugar.disabled = true;
        selLugar.innerHTML = '';
        window.aplicarFiltroFinal();
        return;
    }
    const ciudades = [...new Set(
        App.rawData.slice(1).filter(f => f[14] === fuero).map(f => f[13])
    )].filter(Boolean).sort();
    selLugar.disabled = false;
    selLugar.innerHTML = '<option value="">-- Ciudad --</option>' +
        ciudades.map(c => `<option value="${c}">${c}</option>`).join('');
    window.aplicarFiltroFinal();
};

window.logicCiudad = function () {
    const fuero      = document.getElementById('sel-fuero').value;
    const ciudad     = document.getElementById('sel-lugar').value;
    const selJuzgado = document.getElementById('sel-juzgado');
    if (!ciudad) {
        selJuzgado.disabled = true;
        selJuzgado.innerHTML = '';
        window.aplicarFiltroFinal();
        return;
    }
    const juzgados = [...new Set(
        App.rawData.slice(1).filter(f => f[14] === fuero && f[13] === ciudad).map(f => f[3])
    )].filter(Boolean).sort();
    selJuzgado.disabled = false;
    selJuzgado.innerHTML = '<option value="">-- Juzgado --</option>' +
        juzgados.map(j => `<option value="${j}">${j}</option>`).join('');
    window.aplicarFiltroFinal();
};

window.aplicarFiltroFinal = function () {
    const termG = normalizar(document.getElementById('busqG').value);

    const btnClienteActivo = document.getElementById('btn-f-cliente').classList.contains('activo');
    const btnFueroActivo   = document.getElementById('btn-f-fuero').classList.contains('activo');
    const btnExpActivo     = document.getElementById('btn-f-exp').classList.contains('activo');

    const valC  = document.getElementById('sel-cliente').value;
    const valFu = document.getElementById('sel-fuero').value;
    const valLu = document.getElementById('sel-lugar').value;
    const valJu = document.getElementById('sel-juzgado').value;
    const valE  = normalizar(document.getElementById('txt-exp').value);

    App.filtrados = App.rawData.slice(1).filter(f => {
        const matchGlobal = !termG || f.some(col => normalizar(col).includes(termG));
        const matchC = btnClienteActivo && valC ? f[4] === valC : true;
        let matchF = true;
        if (btnFueroActivo) {
            matchF = (valFu ? f[14] === valFu : true) &&
                     (valLu ? f[13] === valLu : true) &&
                     (valJu ? f[3]  === valJu : true);
        }
        const matchE = btnExpActivo && valE ? normalizar(f[1]) === valE : true;
        return matchGlobal && matchC && matchF && matchE;
    });

    const orden = document.getElementById('orden-fecha')?.value || 'recientes';
    App.filtrados.sort((a, b) => {
        const fa = parseFecha(a[21]);
        const fb = parseFecha(b[21]);
        return orden === 'recientes' ? fb - fa : fa - fb;
    });

    App.paginaActual = 1;
    renderCards(App.filtrados);
};

function limpiarSubFiltros() {
    document.getElementById('sel-cliente').value = '';
    document.getElementById('sel-fuero').value   = '';
    document.getElementById('sel-lugar').innerHTML   = '';
    document.getElementById('sel-lugar').disabled    = true;
    document.getElementById('sel-juzgado').innerHTML = '';
    document.getElementById('sel-juzgado').disabled  = true;
    document.getElementById('txt-exp').value = '';
}

window.resetearBusquedas = function () {
    document.getElementById('busqG').value = '';
    ['cliente', 'fuero', 'exp'].forEach(t => {
        document.getElementById(`btn-f-${t}`).classList.remove('activo');
        document.getElementById(`capa-${t}`).style.display = 'none';
    });
    limpiarSubFiltros();
    document.getElementById('area-filtros').style.display = 'none';
    window.aplicarFiltroFinal();
};

// ── Renderizado de cards ──────────────────────────────────
function renderCards(filas) {
    const total   = filas.length;
    const paginas = Math.ceil(total / PAGE_SIZE);
    const p       = Math.min(App.paginaActual, paginas || 1);
    App.paginaActual = p;

    const inicio = (p - 1) * PAGE_SIZE;
    const slice  = filas.slice(inicio, inicio + PAGE_SIZE);

    const infoEl = document.getElementById('pagination-info');
    infoEl.textContent = total
        ? `Mostrando ${inicio + 1}–${Math.min(inicio + PAGE_SIZE, total)} de ${total} expediente${total !== 1 ? 's' : ''}`
        : 'Sin resultados.';

    const contenedor = document.getElementById('lista-expedientes');
    contenedor.innerHTML = '';

    slice.forEach(f => {
        const realIndex = App.rawData.findIndex(r => r[1] === f[1]);
        const acceso    = tieneAccesoPrivado();
        const c         = idx => campo(f, idx);
        const bloqueado = idx => !acceso && CAPAS.privadaMovil.includes(idx);

        const celdaPrivada = (idx, label) => {
            const val = c(idx);
            if (val === null) return '';
            if (bloqueado(idx)) {
                return `<div class="small mb-1 text-muted fst-italic">
                    <span class="fw-bold">${label}:</span>
                    <span style="color:#aaa;letter-spacing:0.03em;">— Validar Credenciales —</span>
                </div>`;
            }
            return `<div class="small mb-1"><span class="fw-bold">${label}:</span> ${val}</div>`;
        };

        const pendientesVal = c(19);
        const terminoVal    = c(20);

        const pendientes = pendientesVal && !bloqueado(19)
            ? `<div class="small mt-2"><span class="fw-bold">Pendientes:</span> ${pendientesVal}</div>`
            : bloqueado(19)
                ? `<div class="small mt-2 text-muted fst-italic"><span class="fw-bold">Pendientes:</span> <span style="color:#aaa;">— Validar Credenciales —</span></div>`
                : '';

        const termino = terminoVal && !bloqueado(20)
            ? `<div class="small"><span class="fw-bold">Término:</span> ${terminoVal}</div>`
            : bloqueado(20)
                ? `<div class="small text-muted fst-italic"><span class="fw-bold">Término:</span> <span style="color:#aaa;">— Validar Credenciales —</span></div>`
                : '';

        const estadoHtml = bloqueado(11)
            ? `<span class="fst-italic" style="color:#aaa;">— Validar Credenciales —</span>`
            : (c(11) || 'Sin novedades.');

        const ultModHtml = bloqueado(21)
            ? `<span style="color:#aaa;">—</span>`
            : (c(21) || '---');

        const badgeOffline = !acceso
            ? `<div class="text-end mb-1" style="font-size:0.6rem;">
                <span style="background:#f0ad4e22;color:#b8860b;padding:2px 6px;border-radius:4px;border:1px solid #f0ad4e55;">
                    🔒 Modo público
                </span>
               </div>`
            : '';

        contenedor.innerHTML += `
        <div class="card card-exp">
            ${badgeOffline}
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <div class="small text-muted fw-bold">${c(13) || '---'} | ${c(14) || '---'}</div>
                    <div class="small text-secondary">${c(3) || '---'}</div>
                </div>
                <button class="btn-edit" onclick="abrirEditor(${realIndex})" title="Editar">
                    <span class="material-symbols-outlined">edit_note</span>
                </button>
            </div>

            <div class="h6 fw-bold mt-2 mb-1" style="color:var(--navy);">
                EXP: ${c(1) || '---'}
            </div>

            <div class="small mb-1"><span class="fw-bold">Juicio:</span> ${c(7) || '---'}</div>

            ${celdaPrivada(5,  'Actor')}
            ${celdaPrivada(6,  'Demandado')}
            ${celdaPrivada(4,  'Cliente')}
            ${celdaPrivada(2,  'Acumulado')}

            <div class="p-2 bg-light rounded small border-start border-warning border-3 mb-2">
                <div class="fw-bold mb-1">Estado Procesal</div>
                ${estadoHtml}
            </div>

            <div class="small mb-1"><span class="fw-bold">Ubicación:</span> ${c(22) || '---'}</div>

            ${celdaPrivada(17, 'Autorizados')}
            ${celdaPrivada(9,  'Relacionado')}

            ${pendientes}
            ${termino}

            <div class="small mt-2 p-2 rounded" style="background:#fff8e8; border-left:3px solid var(--gold);">
                <span class="fw-bold">Nota rápida:</span> ${c(24) || 'Sin nota'}
            </div>

            <div class="text-end mt-2" style="font-size:0.65rem; color:var(--gold);">
                <div>Rev: ${ultModHtml}</div>
                <div>Última revisión: ${c(23) || '---'}</div>
            </div>
        </div>`;
    });

    renderPaginacion(paginas, p);
}

function renderPaginacion(totalPaginas, actual) {
    const bar = document.getElementById('pagination-bar');
    bar.innerHTML = '';
    if (totalPaginas <= 1) return;

    const ir = (n) => {
        App.paginaActual = n;
        renderCards(App.filtrados);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const prev = document.createElement('button');
    prev.textContent = '‹ Anterior';
    prev.disabled = actual === 1;
    prev.onclick = () => ir(actual - 1);
    bar.appendChild(prev);

    paginasVisibles(actual, totalPaginas).forEach(n => {
        if (n === '…') {
            const span = document.createElement('span');
            span.textContent = '…';
            bar.appendChild(span);
        } else {
            const btn = document.createElement('button');
            btn.textContent = n;
            if (n === actual) btn.classList.add('active');
            btn.onclick = () => ir(n);
            bar.appendChild(btn);
        }
    });

    const next = document.createElement('button');
    next.textContent = 'Siguiente ›';
    next.disabled = actual === totalPaginas;
    next.onclick = () => ir(actual + 1);
    bar.appendChild(next);
}

function paginasVisibles(actual, total) {
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (actual <= 3) return [1, 2, 3, 4, '…', total];
    if (actual >= total - 2) return [1, '…', total - 3, total - 2, total - 1, total];
    return [1, '…', actual - 1, actual, actual + 1, '…', total];
}
