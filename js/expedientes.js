// ════════════════════════════════════════════════════════════
// expedientes.js — Editor, guardado y alta de expedientes
// Depende de: config.js, auth.js, sync.js, ui.js, db.js
// ════════════════════════════════════════════════════════════

// Instancia del modal de Bootstrap (se inicializa al cargar)
let modalEdit = null;

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('modalEditar');
    if (el) modalEdit = new bootstrap.Modal(el);
});

// ── Panel Administrador ──────────────────────────────────
window.abrirAdmin = () => {
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (esMovil) {
        toast('Panel de administrador solo disponible en PC.', 'warning', 5000);
        return;
    }
    if (!tieneAccesoPrivado()) {
        toast('Debes ingresar al sistema para acceder.', 'warning', 5000);
        return;
    }
    toast('Panel de administrador — próximamente.', 'info', 3000);
    // TODO: Implementar panel de administración
};

// ── Modal Nuevo Expediente ────────────────────────────────
window.abrirFormularioNuevoExpediente = () => {

    // Solo permitido en PC/MAC + online + token
    if (!puedeAgregarExpediente()) {
        toast('Alta de expedientes solo disponible en PC con sesión activa.', 'warning', 5000);
        return;
    }

    // Limpiar campos antes de abrir
    limpiarFormularioNuevo();
    document.getElementById('modal-nuevo-expediente').style.display = 'block';
};

window.cerrarFormularioNuevoExpediente = () => {
    document.getElementById('modal-nuevo-expediente').style.display = 'none';
    limpiarFormularioNuevo();
};

function limpiarFormularioNuevo() {
    const ids = [
        'nuevo-expediente', 'nuevo-acumulado', 'nuevo-juzgado',
        'nuevo-cliente', 'nuevo-actor', 'nuevo-demandado',
        'nuevo-juicio', 'nuevo-monto', 'nuevo-relacionado',
        'nuevo-piezas', 'nuevo-estado-procesal', 'nuevo-entidad',
        'nuevo-distrito', 'nuevo-fuero', 'nuevo-recursos',
        'nuevo-sentencia', 'nuevo-autorizados', 'nuevo-observaciones',
        'nuevo-pendientes', 'nuevo-termino', 'nuevo-ubicacion',
        'nuevo-nota-rapida'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// ── Validar si puede agregar expediente ───────────────────
function puedeAgregarExpediente() {
    const esMovil  = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const esPCmac  = !esMovil;
    return esPCmac && navigator.onLine && tieneAccesoPrivado();
}

function esMovil() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function puedeEditarCompleto() {
    return !esMovil() && tieneAccesoPrivado();
}

function estaPublico() {
    return !tieneAccesoPrivado();
}

// ── Guardar Nuevo Expediente ──────────────────────────────
window.nuevoExpediente = async function () {

    // Doble verificación de seguridad
    if (!puedeAgregarExpediente()) {
        toast('Alta de expedientes solo disponible en PC con sesión activa.', 'warning', 5000);
        return;
    }

    // Leer campos del formulario
    const v = id => (document.getElementById(id)?.value || '').trim();

    // Validación mínima: expediente obligatorio
    if (!v('nuevo-expediente')) {
        toast('El número de expediente es obligatorio.', 'warning');
        document.getElementById('nuevo-expediente').focus();
        return;
    }

    const ahora  = new Date();
    const fechaStr =
        String(ahora.getDate()).padStart(2, '0')    + '/' +
        String(ahora.getMonth() + 1).padStart(2, '0') + '/' +
        ahora.getFullYear() + ' ' +
        String(ahora.getHours()).padStart(2, '0')   + ':' +
        String(ahora.getMinutes()).padStart(2, '0') + ':' +
        String(ahora.getSeconds()).padStart(2, '0');

    // Construir fila alineada con COLUMNAS (índices 0–24)
    const nuevaFila = [
        '',                         // 0  ID — Sheets lo asigna (fila auto)
        v('nuevo-expediente'),      // 1  Expediente
        v('nuevo-acumulado'),       // 2  Acumulado
        v('nuevo-juzgado'),         // 3  Juzgado
        v('nuevo-cliente'),         // 4  Cliente
        v('nuevo-actor'),           // 5  Actor
        v('nuevo-demandado'),       // 6  Demandado
        v('nuevo-juicio'),          // 7  Juicio
        v('nuevo-monto'),           // 8  Monto
        v('nuevo-relacionado'),     // 9  Relacionado
        v('nuevo-piezas'),          // 10 Piezas
        v('nuevo-estado-procesal'), // 11 Estado_Procesal
        v('nuevo-entidad'),         // 12 Entidad_Federativa
        v('nuevo-distrito'),        // 13 Distrito_Judicial_o_Ciudad
        v('nuevo-fuero'),           // 14 Fuero
        v('nuevo-recursos'),        // 15 Recursos
        v('nuevo-sentencia'),       // 16 Sentencia
        v('nuevo-autorizados'),     // 17 Autorizados
        v('nuevo-observaciones'),   // 18 Observaciones
        v('nuevo-pendientes'),      // 19 Pendientes
        v('nuevo-termino'),         // 20 Termino
        fechaStr,                   // 21 Ultima_Modificacion
        v('nuevo-ubicacion'),       // 22 Ubicacion_del_Expediente
        fechaStr,                   // 23 Ultima_revision
        v('nuevo-nota-rapida'),     // 24 Nota_rapida
    ];

    // Deshabilitar botón durante el guardado
    const btnGuardar = document.getElementById('btn-guardar-nuevo');
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';
    }

    try {
        // 1. Guardar en Google Sheets y obtener número de fila asignado
        //    guardarNuevoExpedienteRemoto devuelve el ID consecutivo real
        //    extraído del updatedRange de la respuesta de Sheets.
        const idAsignado = await guardarNuevoExpedienteRemoto(nuevaFila);

        // 2. Actualizar la fila local con el ID real
        nuevaFila[0] = String(idAsignado);

        // 3. Generar log del nuevo expediente
        const ahora2   = new Date();
        const fechaLog =
            String(ahora2.getDate()).padStart(2, '0')      + '/' +
            String(ahora2.getMonth() + 1).padStart(2, '0') + '/' +
            ahora2.getFullYear() + ' ' +
            String(ahora2.getHours()).padStart(2, '0')     + ':' +
            String(ahora2.getMinutes()).padStart(2, '0')   + ':' +
            String(ahora2.getSeconds()).padStart(2, '0');

        const logBase = {
            expediente : nuevaFila[1],
            campos     : ['NUEVO_EXPEDIENTE'],
            fecha      : fechaLog,
            modo       : 'ONLINE',
            nivelAcceso: window.getNivelAcceso()
        };
        const hash = await generarHash(logBase);

        const log = {
            logId          : crypto.randomUUID(),
            fecha          : fechaLog,
            usuario        : localStorage.getItem('userEmail') || 'desconocido',
            deviceId       : DEVICE_ID,
            expedienteId   : String(idAsignado),
            expedienteNum  : nuevaFila[1],
            campo          : 'ALTA',
            valorAnterior  : '',
            valorNuevo     : `Expediente ${nuevaFila[1]} creado`,
            versionAnterior: '',
            versionNueva   : fechaLog,
            modo           : 'ONLINE',
            estado         : 'SYNCED',
            hash           : hash,
            nivelAcceso    : window.getNivelAcceso(),          
            
        };

        // Registrar en IndexedDB y subir a hoja LOGS
        await registrarLog(log);
        await subirLogSheets(log);

        // 4. Recargar datos desde Sheets
        if (App.accessToken && tokenVigente()) {
            await consultarDatos();
        } else {
            toast('Expediente guardado. Actualizando lista...', 'success', 3000);
            if (App.tokenClient && navigator.onLine) {
                const email = localStorage.getItem('userEmail') || '';
                App.tokenClient.requestAccessToken({ prompt: '', login_hint: email });
            }
        }

        // 5. Cerrar modal y notificar
        window.cerrarFormularioNuevoExpediente();
        toast(`Expediente creado correctamente. ID: ${idAsignado}`, 'success', 5000);

    } catch (e) {
        console.error('Error al crear expediente:', e);
        toast('No se pudo crear el expediente: ' + (e.message || ''), 'error', 6000);
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar Expediente';
        }
    }
};

// ── Toggle modo edición ───────────────────────────────────
// NOTA: El toggle fue eliminado del modal. Esta función se mantiene por compatibilidad.
window.toggleModoEdicion = function () {
    // Edición completa reservada para acceso PC. Deshabilitada por ahora.
    document.getElementById('modo-simple').style.display = 'block';
    document.getElementById('modo-completo').style.display = 'none';
};

// ── Tipo de revisión ──────────────────────────────────────
window.setTipoRevision = function (tipo) {
    document.getElementById('tipo-revision').value = tipo;
    document.querySelectorAll('.btn-revision').forEach(btn => {
        btn.classList.toggle('activo', btn.textContent.trim() === tipo);
    });
    toast(`Revisión marcada como ${tipo}`, 'success', 1500);
};

// ── Abrir editor ──────────────────────────────────────────
function mostrarSheetRow(row) {
    const label = document.getElementById('edit-sheet-row-info');
    const value = document.getElementById('edit-sheet-row-value');
    if (!label || !value) return;
    if (row && !isNaN(Number(row))) {
        value.textContent = row;
        label.style.display = 'block';
    } else {
        value.textContent = 'No disponible';
        label.style.display = 'block';
    }
}

window.abrirEditor = function (index) {
    if (index < 0 || index >= App.rawData.length) {
        toast('No se encontró el expediente.', 'error');
        return;
    }

    const fila      = App.rawData[index];
    const targetRow = index + 1;

    console.log('[editar] abrirEditor', { index, targetRow, expediente: fila[1], expedienteId: fila[0] });

    // Guardar índice y datos originales
    document.getElementById('edit-row-index').value = targetRow;
    mostrarSheetRow(targetRow);

    // ── Mostrar número de expediente como título fijo ──
    const tituloEl = document.getElementById('edit-modal-titulo-exp');
    if (tituloEl) tituloEl.textContent = 'EXP: ' + (fila[1] || '---');

    // ── Poblar TODOS los campos del formulario ─────────
    document.getElementById('edit-nota').value          = fila[24] || '';
    document.getElementById('edit-ubicacion').value     = fila[22] || '';
    document.getElementById('edit-estado').value        = fila[11] || '';
    document.getElementById('edit-termino').value       = fila[20] || '';
    document.getElementById('edit-pendientes').value    = fila[19] || '';
    document.getElementById('edit-observaciones').value = fila[18] || '';
    document.getElementById('edit-relacionado').value   = fila[9]  || '';
    document.getElementById('edit-piezas').value        = fila[10] || '';
    document.getElementById('edit-recursos').value      = fila[15] || '';
    document.getElementById('edit-sentencia').value     = fila[16] || '';
    document.getElementById('edit-autorizados').value   = fila[17] || '';
    document.getElementById('tipo-revision').value      = '';

    // ── Visibilidad por capa ───────────────────────────
    const publicMode = estaPublico();
    const camposPrivados = ['campo-termino', 'campo-pendientes', 'campo-observaciones',
                            'row-private-mobile-fields', 'campo-estado'];
    camposPrivados.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = publicMode ? 'none' : '';
    });

    // ── Edición completa (reservada) ───────────────────
    const cont = document.getElementById('contenedor-edicion-completa');
    cont.innerHTML = '';
    COLUMNAS.forEach((nombre, i) => {
        if (COLUMNAS_NO_EDITABLES.includes(i)) return;
        cont.innerHTML += `
            <div class="col-md-6">
                <label class="form-label small fw-bold">${nombre}</label>
                <textarea class="form-control campo-completo" rows="2" data-index="${i}">${fila[i] || ''}</textarea>
            </div>`;
    });

    document.getElementById('modo-simple').style.display   = 'block';
    document.getElementById('modo-completo').style.display = 'none';

    // ── Guardar borrador en sessionStorage ─────────────
    // Se activa al detectar cambios en los campos (ver listeners abajo)
    _borrador_rowIndex = targetRow;
    _borrador_sucio    = false;
    _restaurarBorradorSiExiste(targetRow);

    if (modalEdit) modalEdit.show();
};
window.guardarCambios = async function () {
    // 1. VALIDACIÓN PREVENTIVA DE SESIÓN
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
        toast('Error: Sesión no detectada. Por favor, vuelve a iniciar sesión.', 'error');
        return;
    }

    // 2. CONFIGURACIÓN UI BOTONES
    const btnGuardar = document.getElementById('btn-guardar');
    const btnTexto   = document.getElementById('btn-guardar-txt');
    const btnSpinner = document.getElementById('btn-guardar-spin');

    const restaurarBoton = () => {
        if (btnGuardar) btnGuardar.disabled = false;
        if (btnTexto) btnTexto.textContent = 'Guardar';
        if (btnSpinner) btnSpinner.style.display = 'none';
    };

    btnGuardar.disabled = true;
    btnTexto.textContent = 'Guardando...';
    btnSpinner.style.display = 'inline-block';

    try {
        // 3. VALIDACIÓN DE TOKEN
        if (navigator.onLine && (!App.accessToken || !tokenVigente())) {
            const ok = await asegurarToken();
            if (!ok) {
                toast('Sesión expirada.', 'warning');
                restaurarBoton();
                return;
            }
        }

        const rowIndex = Number(document.getElementById('edit-row-index').value);
        const tipoRevision = document.getElementById('tipo-revision').value;
        const filaOriginal = App.rawData[rowIndex - 1];

        if (!tipoRevision || !filaOriginal) {
            toast('Datos incompletos.', 'warning');
            restaurarBoton();
            return;
        }

        // 4. PREPARACIÓN DE DATOS
        const ahora = new Date();
        const fecha = ahora.toLocaleString('es-MX');
        const filaNueva = [...filaOriginal];
        const updates = [];

        function pushUpdate(col, value) {
            const index = col.charCodeAt(0) - 65;
            filaNueva[index] = value;
            updates.push({ col, value });
        }

        // Lógica de campos
        const publicMode = estaPublico();
        if (publicMode) {
            pushUpdate('Y', document.getElementById('edit-nota').value);
            pushUpdate('W', document.getElementById('edit-ubicacion').value);
        } else {
            pushUpdate('Y', document.getElementById('edit-nota').value);
            pushUpdate('J', document.getElementById('edit-relacionado')?.value || '');
            pushUpdate('K', document.getElementById('edit-piezas')?.value || '');
            pushUpdate('L', document.getElementById('edit-estado').value);
            pushUpdate('P', document.getElementById('edit-recursos')?.value || '');
            pushUpdate('Q', document.getElementById('edit-sentencia')?.value || '');
            pushUpdate('R', document.getElementById('edit-autorizados')?.value || '');
            pushUpdate('S', document.getElementById('edit-observaciones').value);
            pushUpdate('T', document.getElementById('edit-pendientes').value);
            pushUpdate('U', document.getElementById('edit-termino').value);
            pushUpdate('W', document.getElementById('edit-ubicacion').value);
        }
        pushUpdate('V', fecha);
        pushUpdate('X', tipoRevision);

        const cambiosReales = updates.filter(u => {
            const index = u.col.charCodeAt(0) - 65;
            return (filaOriginal[index] || '') !== (u.value || '');
        });

        // 5. GENERAR LOGS Y GUARDAR
        const logs = cambiosReales.map(cambio => ({
            logId: crypto.randomUUID(),
            createdAt: Date.now(), // <-- Marca de tiempo protegida
            fecha: fecha,
            usuario: userEmail,
            deviceId: DEVICE_ID || 'PC',
            expedienteId: filaOriginal[0],
            expedienteNum: filaOriginal[1],
            campo: COLUMNAS[cambio.col.charCodeAt(0) - 65],
            valorAnterior: filaOriginal[cambio.col.charCodeAt(0) - 65] || '',
            valorNuevo: cambio.value,
            modo: navigator.onLine ? 'ONLINE' : 'OFFLINE',
            estado: navigator.onLine ? 'SYNCED' : 'PENDING',
            nivelAcceso: window.getNivelAcceso(),
            hash: '...' 
        }));

        await actualizarExpedienteLocal(parseInt(filaNueva[0], 10), filaNueva);
        App.rawData[rowIndex - 1] = filaNueva;

        if (!navigator.onLine) {
            await agregarCambioQueue({ rowIndex, expedienteId: filaNueva[0], fila: filaNueva, updates: cambiosReales, fecha, type: 'update' });
            for (const log of logs) await registrarLog(log);
            toast('Guardado offline.', 'warning');
        } else {
            // ... (aquí iría tu lógica de fetch a Sheets) ...
            for (const log of logs) { 
                await registrarLog(log); 
                await subirLogSheets(log); 
            }
            toast('Guardado correctamente.', 'success');
        }

        if (modalEdit) modalEdit.hide();
        window.aplicarFiltroFinal();

    } catch (e) {
        console.error(e);
        toast('Error: ' + e.message, 'error');
    } finally {
        restaurarBoton();
    }
};
// ── Guardar cambios de edición ────────────────────────────
// ════════════════════════════════════════════════════════════
// ADVERTENCIA AL CERRAR CON BORRADOR SUCIO
// ════════════════════════════════════════════════════════════

function _mostrarAdvertenciaCierre() {

    // Evitar duplicados
    if (document.getElementById('modal-advertencia-cierre')) return;

    const html = `
    <div id="modal-advertencia-cierre" style="
        position:fixed; inset:0; z-index:999999;
        background:rgba(0,0,0,0.65);
        display:flex; align-items:center; justify-content:center;
        padding:16px;
    ">
        <div style="
            background:#fff; border-radius:12px; max-width:420px; width:100%;
            box-shadow:0 8px 32px rgba(0,0,0,0.35);
            overflow:hidden;
        ">
            <!-- Header -->
            <div style="
                background:#c0392b; color:#fff;
                padding:16px 20px;
                font-weight:700; font-size:1rem;
            ">
                ⚠️ Cambios sin guardar
            </div>

            <!-- Cuerpo -->
            <div style="padding:20px; color:#333; font-size:0.95rem; line-height:1.5;">
                Tienes cambios que <strong>no han sido guardados</strong>.<br><br>
                ¿Qué deseas hacer?
            </div>

            <!-- Botones -->
            <div style="
                padding:12px 20px 20px;
                display:flex; flex-direction:column; gap:10px;
            ">
                <button id="btn-adv-continuar" style="
                    padding:11px 16px; border:none; border-radius:8px;
                    background:#1d3557; color:#fff;
                    cursor:pointer; font-weight:700; font-size:0.95rem;
                ">✏️ Continuar editando</button>

                <button id="btn-adv-descartar" style="
                    padding:11px 16px; border:none; border-radius:8px;
                    background:#c0392b; color:#fff;
                    cursor:pointer; font-weight:600; font-size:0.95rem;
                ">🗑️ Descartar cambios y cerrar</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay  = document.getElementById('modal-advertencia-cierre');
    const btnCont  = document.getElementById('btn-adv-continuar');
    const btnDesc  = document.getElementById('btn-adv-descartar');

    // CONTINUAR EDITANDO — cerrar advertencia, el editor sigue abierto
    btnCont.addEventListener('click', () => {
        overlay.remove();
        // No hacer nada más — modalEdit sigue abierto, borrador intacto
    });

    // DESCARTAR — limpiar borrador y cerrar el editor limpiamente
    btnDesc.addEventListener('click', () => {
        overlay.remove();
        _limpiarBorrador(_borrador_rowIndex);
        _borrador_sucio = false;
        // Ahora sí cerrar Bootstrap modal (sin trigger de hide listener)
        if (modalEdit) modalEdit.hide();
    });
}

// ════════════════════════════════════════════════════════════
// SISTEMA DE BORRADOR — guarda cambios no confirmados
// Persiste en sessionStorage para sobrevivir cambio de foco,
// pérdida de conexión o cambio de aplicación.
// Se limpia solo cuando el usuario confirma el guardado.
// ════════════════════════════════════════════════════════════

let _borrador_rowIndex = null;
let _borrador_sucio    = false;

const BORRADOR_CAMPOS = [
    'edit-nota', 'edit-ubicacion', 'edit-estado',
    'edit-termino', 'edit-pendientes', 'edit-observaciones',
    'edit-relacionado', 'edit-piezas', 'edit-recursos',
    'edit-sentencia', 'edit-autorizados', 'tipo-revision'
];

// Guardar borrador en sessionStorage
function _guardarBorrador(rowIndex) {
    if (!rowIndex) return;
    const datos = {};
    BORRADOR_CAMPOS.forEach(id => {
        const el = document.getElementById(id);
        if (el) datos[id] = el.value;
    });
    sessionStorage.setItem('borrador_' + rowIndex, JSON.stringify(datos));
    _borrador_sucio = true;
}

// Restaurar borrador si existe
function _restaurarBorradorSiExiste(rowIndex) {
    const raw = sessionStorage.getItem('borrador_' + rowIndex);
    if (!raw) return;
    try {
        const datos = JSON.parse(raw);
        let restaurado = false;
        BORRADOR_CAMPOS.forEach(id => {
            const el = document.getElementById(id);
            if (el && datos[id] !== undefined) {
                el.value = datos[id];
                restaurado = true;
            }
        });
        if (restaurado) {
            toast('Se restauró un borrador no guardado.', 'warning', 5000);
            _borrador_sucio = true;
        }
    } catch (e) {
        console.warn('Error restaurando borrador:', e);
    }
}

// Limpiar borrador
function _limpiarBorrador(rowIndex) {
    if (!rowIndex) return;
    sessionStorage.removeItem('borrador_' + rowIndex);
    _borrador_sucio = false;
}

// Activar guardado automático de borrador al escribir en cualquier campo
document.addEventListener('DOMContentLoaded', () => {
    BORRADOR_CAMPOS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            if (_borrador_rowIndex) _guardarBorrador(_borrador_rowIndex);
        });
    });

    // ── Interceptar cierre del modal de edición ──────────
    const modalEl = document.getElementById('modalEditar');
    if (modalEl) {

        // 'hide.bs.modal' se dispara ANTES de cerrar — permite cancelar.
        // Si hay borrador sucio, mostrar advertencia en lugar de cerrar.
        modalEl.addEventListener('hide.bs.modal', (e) => {
            if (_borrador_sucio && _borrador_rowIndex) {
                // Cancelar el cierre de Bootstrap
                e.preventDefault();
                e.stopPropagation();
                // Mostrar modal de advertencia
                _mostrarAdvertenciaCierre();
            }
        });

        // 'hidden.bs.modal' se dispara DESPUÉS de cerrar limpiamente.
        // Solo llega aquí si no había borrador sucio o si el usuario descartó.
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!_borrador_sucio) {
                _limpiarBorrador(_borrador_rowIndex);
            }
            _borrador_rowIndex = null;
        });
    }
});

// Guardar borrador si el usuario cambia de ventana/app (pierde foco)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && _borrador_rowIndex && _borrador_sucio) {
        _guardarBorrador(_borrador_rowIndex);
        console.log('[borrador] Guardado al perder foco — rowIndex:', _borrador_rowIndex);
    }
});

window.addEventListener('blur', () => {
    if (_borrador_rowIndex && _borrador_sucio) {
        _guardarBorrador(_borrador_rowIndex);
    }
});

// ════════════════════════════════════════════════════════════
// VENTANA DE CONFIRMACIÓN DE CAMBIOS
// Muestra los campos modificados con valor anterior y nuevo.
// Devuelve Promise<boolean> — true si el usuario confirma.
// ════════════════════════════════════════════════════════════

function mostrarConfirmacionCambios({ expediente, cambiosReales, camposModificados, filaOriginal, filaNueva }) {
    return new Promise(resolve => {

        // Construir tabla de cambios
        const filas = cambiosReales.map(u => {
            const idx       = u.col.charCodeAt(0) - 65;
            const nombre    = COLUMNAS[idx] || u.col;
            const anterior  = (filaOriginal[idx] || '').toString().substring(0, 80) || '—';
            const nuevo     = (u.value || '').toString().substring(0, 80) || '—';
            return `
                <tr>
                    <td style="font-weight:600;padding:6px 10px;white-space:nowrap;">${nombre}</td>
                    <td style="padding:6px 10px;color:#888;font-size:0.85em;">${anterior}</td>
                    <td style="padding:6px 10px;color:#1d3557;font-size:0.85em;">${nuevo}</td>
                </tr>`;
        }).join('');

        const html = `
        <div id="modal-confirmacion" style="
            position:fixed; inset:0; z-index:99999;
            background:rgba(0,0,0,0.6);
            display:flex; align-items:center; justify-content:center;
            padding:16px;
        ">
            <div style="
                background:#fff; border-radius:12px; max-width:680px; width:100%;
                max-height:80vh; overflow-y:auto;
                box-shadow:0 8px 32px rgba(0,0,0,0.3);
            ">
                <!-- Header -->
                <div style="
                    background:#1d3557; color:#fff;
                    padding:16px 20px; border-radius:12px 12px 0 0;
                    display:flex; justify-content:space-between; align-items:center;
                ">
                    <div>
                        <div style="font-weight:700;font-size:1rem;">Confirmar cambios</div>
                        <div style="font-size:0.8rem;opacity:0.8;">EXP: ${expediente || '---'}</div>
                    </div>
                    <span style="
                        background:#c8a951; color:#1d3557;
                        padding:3px 10px; border-radius:20px;
                        font-size:0.75rem; font-weight:700;
                    ">${cambiosReales.length} campo${cambiosReales.length !== 1 ? 's' : ''}</span>
                </div>

                <!-- Tabla de cambios -->
                <div style="padding:16px 20px;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="border-bottom:2px solid #eee;">
                                <th style="padding:6px 10px;text-align:left;color:#666;">Campo</th>
                                <th style="padding:6px 10px;text-align:left;color:#666;">Valor anterior</th>
                                <th style="padding:6px 10px;text-align:left;color:#1d3557;">Valor nuevo</th>
                            </tr>
                        </thead>
                        <tbody>${filas}</tbody>
                    </table>
                </div>

                <!-- Botones -->
                <div style="
                    padding:12px 20px 20px;
                    display:flex; justify-content:flex-end; gap:10px;
                    border-top:1px solid #eee;
                ">
                    <button id="btn-conf-cancelar" style="
                        padding:10px 20px; border:none; border-radius:8px;
                        background:#adb5bd; color:#fff; cursor:pointer; font-weight:600;
                    ">Cancelar</button>
                    <button id="btn-conf-confirmar" style="
                        padding:10px 24px; border:none; border-radius:8px;
                        background:#1d3557; color:#fff; cursor:pointer; font-weight:700;
                    ">Confirmar y guardar</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);

        const modal    = document.getElementById('modal-confirmacion');
        const btnOk    = document.getElementById('btn-conf-confirmar');
        const btnCan   = document.getElementById('btn-conf-cancelar');

        const limpiar = () => modal.remove();

        btnOk.addEventListener('click', () => { limpiar(); resolve(true);  });
        btnCan.addEventListener('click', () => { limpiar(); resolve(false); });

        // Click fuera del panel = cancelar
        modal.addEventListener('click', e => {
            if (e.target === modal) { limpiar(); resolve(false); }
        });
    });
}
