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
        // 1. Guardar en Google Sheets (obligatorio — solo se llega aquí online + token)
        await guardarNuevoExpedienteRemoto(nuevaFila);

        // 2. Recargar datos desde Sheets para obtener el ID real asignado.
        //    Verificar token antes de llamar — puede haber expirado durante el guardado.
        if (App.accessToken && tokenVigente()) {
            await consultarDatos();
        } else {
            // Token expirado: renovar silenciosamente.
            // consultarDatos() se llamará desde el callback de initGis.
            toast('Expediente guardado. Actualizando lista...', 'success', 3000);
            if (App.tokenClient && navigator.onLine) {
                const email = localStorage.getItem('userEmail') || '';
                App.tokenClient.requestAccessToken({ prompt: '', login_hint: email });
            }
        }

        // 3. Cerrar modal y notificar
        window.cerrarFormularioNuevoExpediente();
        toast('Expediente creado correctamente.', 'success', 4000);

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

// ── Guardar cambios de edición ────────────────────────────
window.guardarCambios = async function () {

    const btnGuardar = document.getElementById('btn-guardar');
    const btnTexto   = document.getElementById('btn-guardar-txt');
    const btnSpinner = document.getElementById('btn-guardar-spin');

    const restaurarBoton = () => {
        btnGuardar.disabled  = false;
        btnTexto.textContent = 'Guardar';
        btnSpinner.style.display = 'none';
    };

    btnGuardar.disabled  = true;
    btnTexto.textContent = 'Guardando...';
    btnSpinner.style.display = 'inline-block';

    try {
        // Validación de sesión — renovar si expiró (dentro del gesto del usuario)
        if (navigator.onLine && (!App.accessToken || !tokenVigente())) {
            toast('Renovando sesión...', 'warning', 3000);
            const ok = await asegurarToken();
            if (!ok) {
                toast('Sesión expirada. Vuelve a ingresar.', 'warning');
                restaurarBoton();
                return;
            }
        }

        const rowIndexValue = document.getElementById('edit-row-index').value;
        const rowIndex      = Number(rowIndexValue);
        const tipoRevision  = document.getElementById('tipo-revision').value;

        console.log('[editar] guardarCambios', {
            rowIndexValue,
            rowIndex,
            tipoRevision,
            nota: document.getElementById('edit-nota').value,
            ubicacion: document.getElementById('edit-ubicacion').value,
            publicMode: estaPublico()
        });

        if (!tipoRevision) {
            toast('Debes seleccionar FÍSICO o DIGITAL.', 'warning');
            restaurarBoton();
            return;
        }

        // Edición completa quedó reservada para acceso PC+token y no hay
        // control UI para activarla por ahora. Forzar a false aquí.
        const completo = (puedeEditarCompleto() && false);

        const ahora = new Date();
        const fecha =
            String(ahora.getDate()).padStart(2, '0')    + '/' +
            String(ahora.getMonth() + 1).padStart(2, '0') + '/' +
            ahora.getFullYear() + ' ' +
            String(ahora.getHours()).padStart(2, '0')   + ':' +
            String(ahora.getMinutes()).padStart(2, '0') + ':' +
            String(ahora.getSeconds()).padStart(2, '0');

        const filaOriginal = App.rawData[rowIndex - 1];
        if (!filaOriginal) {
            toast('No se encontró la fila a actualizar.', 'error');
            restaurarBoton();
            return;
        }

        // ── Declarar filaNueva y updates (bug fix — faltaban) ──
        const filaNueva = [...filaOriginal];
        const updates   = [];

        const expedienteId = filaOriginal[0];
        let sheetRow = rowIndex > 1 ? rowIndex : null;
        if (!sheetRow && expedienteId) {
            const found = App.rawData.findIndex(r => String(r[0]) === String(expedienteId));
            if (found >= 1) sheetRow = found;
        }

        if (!sheetRow) {
            toast('No se pudo determinar la fila de hoja para el expediente.', 'error');
            mostrarSheetRow(null);
            restaurarBoton();
            return;
        }

        mostrarSheetRow(sheetRow);

        function pushUpdate(col, value) {
            const index = col.charCodeAt(0) - 65;
            filaNueva[index] = value;
            updates.push({ col, value });
        }

        const publicMode = estaPublico();

        if (!completo) {
            if (publicMode) {
                // MODO PÚBLICO: solo Nota Rápida (Y) y Ubicación del Expediente (W)
                pushUpdate('Y', document.getElementById('edit-nota').value);
                pushUpdate('W', document.getElementById('edit-ubicacion').value);
            } else {
                // MODO PRIVADA MÓVIL: todos los campos de la tabla
                pushUpdate('Y', document.getElementById('edit-nota').value);
                pushUpdate('J', document.getElementById('edit-relacionado')?.value || ''); // 9
                pushUpdate('K', document.getElementById('edit-piezas')?.value || '');      //10
                pushUpdate('L', document.getElementById('edit-estado').value);            //11
                pushUpdate('P', document.getElementById('edit-recursos')?.value || '');    //15
                pushUpdate('Q', document.getElementById('edit-sentencia')?.value || '');   //16
                pushUpdate('R', document.getElementById('edit-autorizados')?.value || ''); //17
                pushUpdate('S', document.getElementById('edit-observaciones').value);      //18
                pushUpdate('T', document.getElementById('edit-pendientes').value);        //19
                pushUpdate('U', document.getElementById('edit-termino').value);           //20
                pushUpdate('W', document.getElementById('edit-ubicacion').value);         //22
            }
        } else {
            document.querySelectorAll('.campo-completo').forEach(el => {
                const index = parseInt(el.dataset.index, 10);
                pushUpdate(String.fromCharCode(65 + index), el.value);
            });
        }

        pushUpdate('V', fecha);
        pushUpdate('X', tipoRevision);

        const cambiosReales = updates.filter(u => {
            const index = u.col.charCodeAt(0) - 65;
            return (filaOriginal[index] || '') !== (u.value || '');
        });

        if (!cambiosReales.length) {
            toast('No se detectaron cambios.', 'warning');
            restaurarBoton();
            return;
        }

        const camposModificados = cambiosReales.map(u => COLUMNAS[u.col.charCodeAt(0) - 65]);

        // ── Ventana de confirmación ────────────────────────
        const confirmado = await mostrarConfirmacionCambios({
            expediente    : filaOriginal[1],
            cambiosReales,
            camposModificados,
            filaOriginal,
            filaNueva
        });
        if (!confirmado) {
            toast('Cambios cancelados.', 'warning', 2000);
            restaurarBoton();
            return;
        }

        const logBase = {
            expediente  : filaNueva[1],
            campos      : camposModificados,
            totalCampos : camposModificados.length,
            fecha,
            modo        : navigator.onLine ? 'ONLINE' : 'OFFLINE',
            capas       : publicMode ? 'PÚBLICO' : 'PRIVADA_MÓVIL'
        };

        const hash = await generarHash(logBase);

        const log = {
            logId          : crypto.randomUUID(),
            fecha,
            usuario        : localStorage.getItem('usuario') || 'desconocido',
            deviceId       : DEVICE_ID,
            expedienteId   : filaNueva[0],
            campo          : `UPDATE (${camposModificados.length} campos)`,
            valorAnterior  : '',
            valorNuevo     : camposModificados.join(', '),
            versionAnterior: filaOriginal[21] || '',
            versionNueva   : fecha,
            modo           : navigator.onLine ? 'ONLINE' : 'OFFLINE',
            capas          : publicMode ? 'PÚBLICO' : 'PRIVADA_MÓVIL',
            estado         : navigator.onLine ? 'SYNCED'  : 'PENDING',
            hash
        };

        // Guardar local siempre
        await actualizarExpedienteLocal(parseInt(filaNueva[0], 10), filaNueva);
        App.rawData[rowIndex - 1] = filaNueva;

        if (!navigator.onLine) {
            await agregarCambioQueue({ 
                rowIndex: sheetRow, 
                expedienteId: filaNueva[0], 
                fila: filaNueva, 
                updates: cambiosReales, 
                fecha,  // Timestamp de MODIFICACIÓN (cuando el usuario hizo los cambios)
                type: 'update'
            });
            await registrarLog(log);
            programarExportacionPendientes();
            toast('Guardado offline. Pendiente de sincronización.', 'warning', 5000);
        } else {
            // Determinar fila objetivo (sheetRow). Usar rowIndex si es válido, sino buscar por expedienteId.
            let sheetRow = null;
            if (rowIndex && !isNaN(Number(rowIndex))) {
                sheetRow = Number(rowIndex);
            } else if (filaNueva[0]) {
                const datos = App.rawData.slice(1);
                const found = datos.findIndex(r => String(r[0]) === String(filaNueva[0]));
                if (found >= 0) sheetRow = found + 2; // slice[0] == hoja row 2
            }

            if (!sheetRow) {
                toast('No se pudo determinar la fila objetivo para la actualización remota.', 'error', 6000);
                console.error('[editar] sheetRow no determinado', { rowIndex, expedienteId: filaNueva[0], filaNueva });
                restaurarBoton();
                return;
            }

            console.log('[editar] actualizando remota', { sheetRow, cambiosReales });

            for (const u of cambiosReales) {
                const response = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!${u.col}${sheetRow}?valueInputOption=USER_ENTERED`,
                    {
                        method : 'PUT',
                        headers: {
                            'Authorization': 'Bearer ' + App.accessToken,
                            'Content-Type' : 'application/json'
                        },
                        body: JSON.stringify({ values: [[u.value]] })
                    }
                );

                if (response.status === 429) {
                    await new Promise(r => setTimeout(r, 1000));
                    const retry = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!${u.col}${sheetRow}?valueInputOption=USER_ENTERED`,
                        {
                            method : 'PUT',
                            headers: {
                                'Authorization': 'Bearer ' + App.accessToken,
                                'Content-Type' : 'application/json'
                            },
                            body: JSON.stringify({ values: [[u.value]] })
                        }
                    );
                    if (!retry.ok) throw new Error(`Error Google Sheets ${retry.status}`);
                } else if (!response.ok) {
                    throw new Error(`Error Google Sheets ${response.status}`);
                }
            }

            await registrarLog(log);
            await subirLogSheets(log);
            toast('Expediente actualizado.', 'success');
        }

        // ── Limpiar borrador al guardar exitosamente ──
        _limpiarBorrador(_borrador_rowIndex);
        _borrador_sucio = false;

        if (modalEdit) modalEdit.hide();
        window.aplicarFiltroFinal();

    } catch (e) {
        console.error(e);
        toast('No se pudo guardar: ' + (e.message || ''), 'error', 7000);
    } finally {
        restaurarBoton();
    }
};


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

    // Al cerrar el modal sin guardar: conservar borrador (no limpiarlo)
    const modalEl = document.getElementById('modalEditar');
    if (modalEl) {
        modalEl.addEventListener('hidden.bs.modal', () => {
            // Solo limpiar si NO hay cambios sucios (ya confirmados)
            // Si hay borrador sucio, quedará en sessionStorage para la próxima apertura
            if (!_borrador_sucio) {
                _limpiarBorrador(_borrador_rowIndex);
            }
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
