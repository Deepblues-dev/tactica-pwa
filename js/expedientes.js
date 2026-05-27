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

        // 2. Recargar datos desde Sheets para obtener el ID real asignado
        await consultarDatos();

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
window.toggleModoEdicion = function () {
    const completo = document.getElementById('toggle-edicion').checked;
    document.getElementById('modo-simple').style.display   = completo ? 'none'  : 'block';
    document.getElementById('modo-completo').style.display = completo ? 'block' : 'none';
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
window.abrirEditor = function (index) {
    if (index < 0 || index >= App.rawData.length) {
        toast('No se encontró el expediente.', 'error');
        return;
    }

    const fila = App.rawData[index];
    document.getElementById('edit-row-index').value      = index + 1;
    document.getElementById('edit-nota').value           = fila[24] || '';
    document.getElementById('edit-ubicacion').value      = fila[22] || '';
    document.getElementById('edit-estado').value         = fila[11] || '';
    document.getElementById('edit-termino').value        = fila[20] || '';
    document.getElementById('edit-pendientes').value     = fila[19] || '';
    document.getElementById('edit-observaciones').value  = fila[18] || '';
    document.getElementById('tipo-revision').value       = '';

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

    document.getElementById('toggle-edicion').checked = false;
    window.toggleModoEdicion();
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
        // Validación de sesión
        if (navigator.onLine && !App.accessToken) {
            toast('Sesión expirada.', 'warning');
            restaurarBoton();
            return;
        }

        const rowIndex     = document.getElementById('edit-row-index').value;
        const tipoRevision = document.getElementById('tipo-revision').value;

        if (!tipoRevision) {
            toast('Debes seleccionar FÍSICO o DIGITAL.', 'warning');
            restaurarBoton();
            return;
        }

        const completo = document.getElementById('toggle-edicion').checked;

        const ahora = new Date();
        const fecha =
            String(ahora.getDate()).padStart(2, '0')    + '/' +
            String(ahora.getMonth() + 1).padStart(2, '0') + '/' +
            ahora.getFullYear() + ' ' +
            String(ahora.getHours()).padStart(2, '0')   + ':' +
            String(ahora.getMinutes()).padStart(2, '0') + ':' +
            String(ahora.getSeconds()).padStart(2, '0');

        const filaOriginal = App.rawData[rowIndex - 1];
        const filaNueva    = [...filaOriginal];
        const updates      = [];

        function pushUpdate(col, value) {
            const index = col.charCodeAt(0) - 65;
            filaNueva[index] = value;
            updates.push({ col, value });
        }

        if (!completo) {
            pushUpdate('Y', document.getElementById('edit-nota').value);
            pushUpdate('W', document.getElementById('edit-ubicacion').value);
            pushUpdate('L', document.getElementById('edit-estado').value);
            pushUpdate('U', document.getElementById('edit-termino').value);
            pushUpdate('T', document.getElementById('edit-pendientes').value);
            pushUpdate('S', document.getElementById('edit-observaciones').value);
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

        const logBase = {
            expediente  : filaNueva[1],
            campos      : camposModificados,
            totalCampos : camposModificados.length,
            fecha,
            modo        : navigator.onLine ? 'ONLINE' : 'OFFLINE'
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
            estado         : navigator.onLine ? 'SYNCED'  : 'PENDING',
            hash
        };

        // Guardar local siempre
        await actualizarExpedienteLocal(parseInt(filaNueva[0], 10), filaNueva);
        App.rawData[rowIndex - 1] = filaNueva;

        if (!navigator.onLine) {
            await agregarCambioQueue({ rowIndex, expedienteId: filaNueva[0], fila: filaNueva, updates: cambiosReales, fecha });
            await registrarLog(log);
            programarExportacionPendientes();
            toast('Guardado offline. Pendiente de sincronización.', 'warning', 5000);
        } else {
            for (const u of cambiosReales) {
                const response = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!${u.col}${rowIndex}?valueInputOption=USER_ENTERED`,
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
                        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!${u.col}${rowIndex}?valueInputOption=USER_ENTERED`,
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

        if (modalEdit) modalEdit.hide();
        window.aplicarFiltroFinal();

    } catch (e) {
        console.error(e);
        toast('No se pudo guardar: ' + (e.message || ''), 'error', 7000);
    } finally {
        restaurarBoton();
    }
};
