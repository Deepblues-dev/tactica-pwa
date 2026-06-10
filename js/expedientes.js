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
    const esMovil  = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const esPCmac  = !esMovil;
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

    const ahora  = new Date();
    const fechaStr =
        String(ahora.getDate()).padStart(2, '0')    + '/' +
        String(ahora.getMonth() + 1).padStart(2, '0') + '/' +
        ahora.getFullYear() + ' ' +
        String(ahora.getHours()).padStart(2, '0')   + ':' +
        String(ahora.getMinutes()).padStart(2, '0') + ':' +
        String(ahora.getSeconds()).padStart(2, '0');

    // Construir fila alineada con COLUMNAS (índices 0–24)
    const nuevaFila = [
        '',                         // 0  ID — Sheets lo asigna (fila auto)
        v('nuevo-expediente'),      // 1  Expediente
        v('nuevo-acumulado'),       // 2  Acumulado
        v('nuevo-juzgado'),         // 3  Juzgado
        v('nuevo-cliente'),         // 4  Cliente
        v('nuevo-actor'),           // 5  Actor
        v('nuevo-demandado'),       // 6  Demandado
        v('nuevo-juicio'),          // 7  Juicio
        v('nuevo-monto'),           // 8  Monto
        v('nuevo-relacionado'),     // 9  Relacionado
        v('nuevo-piezas'),          // 10 Piezas
        v('nuevo-estado-procesal'), // 11 Estado_Procesal
        v('nuevo-entidad'),         // 12 Entidad_Federativa
        v('nuevo-distrito'),        // 13 Distrito_Judicial_o_Ciudad
        v('nuevo-fuero'),           // 14 Fuero
        v('nuevo-recursos'),        // 15 Recursos
        v('nuevo-sentencia'),       // 16 Sentencia
        v('nuevo-autorizados'),     // 17 Autorizados
        v('nuevo-observaciones'),   // 18 Observaciones
        v('nuevo-pendientes'),      // 19 Pendientes
        v('nuevo-termino'),         // 20 Termino
        fechaStr,                   // 21 Ultima_Modificacion
        v('nuevo-ubicacion'),       // 22 Ubicacion_del_Expediente
        fechaStr,                   // 23 Ultima_revision
        v('nuevo-nota-rapida'),     // 24 Nota_rapida
    ];

    // Deshabilitar botón durante el guardado
    const btnGuardar = document.getElementById('btn-guardar-nuevo');
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';
    }

    try {
        // 1. Guardar en Google Sheets y obtener número de fila asignado
        //    guardarNuevoExpedienteRemoto devuelve el ID consecutivo real
        //    extraído del updatedRange de la respuesta de Sheets.
        const idAsignado = await guardarNuevoExpedienteRemoto(nuevaFila);

        // 2. Actualizar la fila local con el ID real
        nuevaFila[0] = String(idAsignado);

        // 3. Generar log del nuevo expediente
        const ahora2   = new Date();
        const fechaLog =
            String(ahora2.getDate()).padStart(2, '0')      + '/' +
            String(ahora2.getMonth() + 1).padStart(2, '0') + '/' +
            ahora2.getFullYear() + ' ' +
            String(ahora2.getHours()).padStart(2, '0')     + ':' +
            String(ahora2.getMinutes()).padStart(2, '0')   + ':' +
            String(ahora2.getSeconds()).padStart(2, '0');

        const logBase = {
            expediente : nuevaFila[1],
            campos     : ['NUEVO_EXPEDIENTE'],
            fecha      : fechaLog,
            modo       : 'ONLINE',
            nivelAcceso: window.getNivelAcceso()
        };
        const hash = await generarHash(logBase);

        const log = {
            logId          : crypto.randomUUID(),
            fecha          : fechaLog,
            usuario        : localStorage.getItem('userEmail') || 'desconocido',
            deviceId       : DEVICE_ID,
            expedienteId   : String(idAsignado),
            expedienteNum  : nuevaFila[1],
            campo          : 'ALTA',
            valorAnterior  : '',
            valorNuevo     : `Expediente ${nuevaFila[1]} creado`,
            versionAnterior: '',
            versionNueva   : fechaLog,
            modo           : 'ONLINE',
            estado         : 'SYNCED',
            hash           : hash,
            nivelAcceso    : window.getNivelAcceso(),          
            
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

    const fila      = App.rawData[index];
    const targetRow = index + 1;

    console.log('[editar] abrirEditor', { index, targetRow, expediente: fila[1], expedienteId: fila[0] });

    // Guardar índice y datos originales
    document.getElementById('edit-row-index').value = targetRow;
    mostrarSheetRow(targetRow);

    // ── Mostrar número de expediente como título fijo ──
    const tituloEl = document.getElementById('edit-modal-titulo-exp');
    if (tituloEl) tituloEl.textContent = 'EXP: ' + (fila[1] || '---');

    // ── Poblar TODOS los campos del formulario ─────────
    document.getElementById('edit-nota').value          = fila[24] || '';
    document.getElementById('edit-ubicacion').value     = fila[22] || '';
    document.getElementById('edit-estado').value        = fila[11] || '';
    document.getElementById('edit-termino').value       = fila[20] || '';
    document.getElementById('edit-pendientes').value    = fila[19] || '';
    document.getElementById('edit-observaciones').value = fila[18] || '';
    document.getElementById('edit-relacionado').value   = fila[9]  || '';
    document.getElementById('edit-piezas').value        = fila[10] || '';
    document.getElementById('edit-recursos').value      = fila[15] || '';
    document.getElementById('edit-sentencia').value     = fila[16] || '';
    document.getElementById('edit-autorizados').value   = fila[17] || '';
    document.getElementById('tipo-revision').value      = '';

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

    document.getElementById('modo-simple').style.display   = 'block';
    document.getElementById('modo-completo').style.display = 'none';

    // ── Guardar borrador en sessionStorage ─────────────
    // Se activa al detectar cambios en los campos (ver listeners abajo)
    _borrador_rowIndex = targetRow;
    _borrador_sucio    = false;
    _restaurarBorradorSiExiste(targetRow);

    if (modalEdit) modalEdit.show();
};

// ── Guardar cambios de edición ────────────────────────────window.guardarCambios = async function () {
    // 1. VALIDACIÓN PREVENTIVA DE SESIÓN
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
        toast('Error: Sesión no detectada. Por favor, vuelve a iniciar sesión.', 'error');
        return;
    }

    // 2. PREPARACIÓN DE BOTONES (UI)
    const btnGuardar = document.getElementById('btn-guardar');
    const btnTexto   = document.getElementById('btn-guardar-txt');
    const btnSpinner = document.getElementById('btn-guardar-spin');

    const restaurarBoton = () => {
        btnGuardar.disabled  = false;
        btnTexto.textContent = 'Guardar';
        btnSpinner.style.display = 'none';
    };

    btnGuardar.disabled  = true;
    btnTexto.textContent = 'Guardando...';
    btnSpinner.style.display = 'inline-block';

    try {
        // 3. VALIDACIÓN/RENOVACIÓN DE TOKEN
        if (navigator.onLine && (!App.accessToken || !tokenVigente())) {
            toast('Renovando sesión...', 'warning', 3000);
            const ok = await asegurarToken();
            if (!ok) {
                toast('Sesión expirada. Vuelve a ingresar.', 'warning');
                restaurarBoton();
                return;
            }
        }

        // 4. LÓGICA DE EDICIÓN
        const rowIndexValue = document.getElementById('edit-row-index').value;
        const rowIndex      = Number(rowIndexValue);
        const tipoRevision  = document.getElementById('tipo-revision').value;
        
        if (!tipoRevision) {
            toast('Debes seleccionar FÍSICO o DIGITAL.', 'warning');
            restaurarBoton();
            return;
        }

        const filaOriginal = App.rawData[rowIndex - 1];
        if (!filaOriginal) {
            toast('No se encontró la fila a actualizar.', 'error');
            restaurarBoton();
            return;
        }

        // --- AQUÍ CONSTRUYES TU OBJETO LOG USANDO LA FUNCIÓN CENTRALIZADA ---
        const log = {
            logId: crypto.randomUUID(),
            fecha: new Date().toLocaleString('es-MX'),
            usuario: userEmail,
            deviceId: localStorage.getItem('deviceId') || 'PC',
            expedienteId: filaOriginal[0],
            expedienteNum: filaOriginal[1],
            campo: 'General', // O el campo específico que detectes
            valorAnterior: 'N/A', // Aquí iría tu lógica de comparación
            valorNuevo: tipoRevision,
            nivelAcceso: window.getNivelAcceso(),
            modo: navigator.onLine ? 'ONLINE' : 'OFFLINE',
            estado: 'PENDIENTE',
            hash: '...' // Tu lógica de hash
        };

        // 5. PROCESAR LOG Y GUARDAR CAMBIOS
        await procesarLog(log); 
        
        // ... (Aquí iría el resto de tu lógica para actualizar filaNueva y aplicar updates) ...

        const estaOnline = navigator.onLine;
        toast(estaOnline ? 'Cambios guardados y sincronizados.' : 'Guardado localmente. Se sincronizará al recuperar internet.', estaOnline ? 'success' : 'warning');
        
    } catch (error) {
        console.error(error);
        toast('Error al guardar: ' + error.message, 'error');
    } finally {
        restaurarBoton();
    }
};

    const btnGuardar = document.getElementById('btn-guardar');
    const btnTexto   = document.getElementById('btn-guardar-txt');
    const btnSpinner = document.getElementById('btn-guardar-spin');

    const restaurarBoton = () => {
        btnGuardar.disabled  = false;
        btnTexto.textContent = 'Guardar';
        btnSpinner.style.display = 'none';
    };

    btnGuardar.disabled  = true;
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
        const rowIndex      = Number(rowIndexValue);
        const tipoRevision  = document.getElementById('tipo-revision').value;

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
            String(ahora.getDate()).padStart(2, '0')    + '/' +
            String(ahora.getMonth() + 1).padStart(2, '0') + '/' +
            ahora.getFullYear() + ' ' +
            String(ahora.getHours()).padStart(2, '0')   + ':' +
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
        const updates   = [];

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
                // MODO PRIVADA MOVIL: todos los campos de la tabla
                pushUpdate('Y', document.getElementById('edit-nota').value);
                pushUpdate('J', document.getElementById('edit-relacionado')?.value || ''); // 9
                pushUpdate('K', document.getElementById('edit-piezas')?.value || '');      //10
                pushUpdate('L', document.getElementById('edit-estado').value);            //11
                pushUpdate('P', document.getElementById('edit-recursos')?.value || '');    //15
                pushUpdate('Q', document.getElementById('edit-sentencia')?.value || '');   //16
                pushUpdate('R', document.getElementById('edit-autorizados')?.value || ''); //17
                pushUpdate('S', document.getElementById('edit-observaciones').value);      //18
                pushUpdate('T', document.getElementById('edit-pendientes').value);        //19
                pushUpdate('U', document.getElementById('edit-termino').value);           //20
                pushUpdate('W', document.getElementById('edit-ubicacion').value);         //22
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
            expediente    : filaOriginal[1],
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

const logs = [];

for (const cambio of cambiosReales) {

    const nombreCampo =
        COLUMNAS[cambio.col.charCodeAt(0) - 65];

    const valorAnterior =
        filaOriginal[
            cambio.col.charCodeAt(0) - 65
        ] || '';

    const logBase = {
        expediente : filaNueva[1],
        campo      : nombreCampo,
        anterior   : valorAnterior,
        nuevo      : cambio.value,
        fecha,
        modo       : navigator.onLine
            ? 'ONLINE'
            : 'OFFLINE'
    };

    const hash = await generarHash(logBase);

    logs.push({

logId: crypto.randomUUID(),

        fecha,

        usuario:
            localStorage.getItem('userEmail')
            || 'desconocido',

        deviceId: DEVICE_ID,

        expedienteId:
            filaNueva[0],

        expedienteNum:
            filaNueva[1],

        campo:
            nombreCampo,

        valorAnterior,

        valorNuevo:
            cambio.value,

        versionAnterior:
            filaOriginal[21] || '',

        versionNueva:
            fecha,

        modo:
            navigator.onLine
                ? 'ONLINE'
                : 'OFFLINE',

        estado:
            navigator.onLine
                ? 'SYNCED'
                : 'PENDING',

        hash,

       nivelAcceso: window.getNivelAcceso(),

    const esDispositivoMovil =
        /Android|iPhone|iPad|iPod/i.test(
            navigator.userAgent
        );

    if (esDispositivoMovil) {
        return 'PRIVADA_MOVIL';
    }

    return 'PC';

})()
    });
}

        // Guardar local siempre
        await actualizarExpedienteLocal(parseInt(filaNueva[0], 10), filaNueva);
        App.rawData[rowIndex - 1] = filaNueva;

        if (!navigator.onLine) {
            await agregarCambioQueue({ 
                rowIndex: sheetRow, 
                expedienteId: filaNueva[0], 
                fila: filaNueva, 
                updates: cambiosReales, 
                fecha,  // Timestamp de MODIFICACIÓN (cuando el usuario hizo los cambios)
                type: 'update'
            });
            for (const log of logs) {
    await registrarLog(log);
}
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

           for (const log of logs) {

    await registrarLog(log);

    await subirLogSheets(log);
}
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

    const overlay  = document.getElementById('modal-advertencia-cierre');
    const btnCont  = document.getElementById('btn-adv-continuar');
    const btnDesc  = document.getElementById('btn-adv-descartar');

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
let _borrador_sucio    = false;

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
        console.warn('Error restaurando borrador:'
