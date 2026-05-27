const DB_NAME = 'tactica-db';
const DB_VERSION = 2;

let db;

// ═══════════════════════════════════════
// INICIALIZAR DB
// ═══════════════════════════════════════
async function initDB() {

    return new Promise((resolve, reject) => {

        const request = indexedDB.open(
            DB_NAME,
            DB_VERSION
        );

        request.onupgradeneeded = e => {

            db = e.target.result;

            // ═══════════════════════════════
            // EXPEDIENTES
            // ═══════════════════════════════
            if (!db.objectStoreNames.contains('expedientes')) {

                const expedienteStore =
                    db.createObjectStore(
                        'expedientes',
                        {
                            keyPath: 'id'
                        }
                    );

                expedienteStore.createIndex(
                    'id',
                    'id',
                    { unique: true }
                );
            }

            // ═══════════════════════════════
            // QUEUE
            // ═══════════════════════════════
            if (!db.objectStoreNames.contains('queue')) {

                const queueStore =
                    db.createObjectStore(
                        'queue',
                        {
                            keyPath: 'queueId',
                            autoIncrement: true
                        }
                    );

                queueStore.createIndex(
                    'synced',
                    'synced',
                    { unique: false }
                );

                queueStore.createIndex(
                    'createdAt',
                    'createdAt',
                    { unique: false }
                );

                queueStore.createIndex(
                    'conflicto',
                    'conflicto',
                    { unique: false }
                );
            }

            // ═══════════════════════════════
            // LOGS
            // ═══════════════════════════════
            if (!db.objectStoreNames.contains('logs')) {

                const logsStore =
                    db.createObjectStore(
                        'logs',
                        {
                            keyPath: 'logId'
                        }
                    );

                logsStore.createIndex(
                    'fecha',
                    'fecha',
                    { unique: false }
                );

                logsStore.createIndex(
                    'expedienteId',
                    'expedienteId',
                    { unique: false }
                );

                logsStore.createIndex(
                    'estado',
                    'estado',
                    { unique: false }
                );
            }
        };

        request.onsuccess = e => {

            db = e.target.result;

            resolve();
        };

        request.onerror = e => {

            console.error(
                'IndexedDB Error:',
                e
            );

            reject(e);
        };
    });
}

// ═══════════════════════════════════════
// GUARDAR EXPEDIENTES
// ═══════════════════════════════════════
async function guardarExpedientesLocal(filas) {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'expedientes',
            'readwrite'
        );

        const store =
            tx.objectStore('expedientes');

        store.clear();

        filas.slice(1).forEach((f, idx) => {

            // keyPath 'id' debe ser entero válido.
            // Si f[0] vacío (expediente sin ID de Sheets aún),
            // asignar ID temporal negativo para no colisionar con IDs reales.
            const idRaw   = parseInt(f[0]);
            const idFinal = Number.isFinite(idRaw) && idRaw > 0
                ? idRaw
                : -(idx + 1);

            store.put({
                id  : idFinal,
                fila: f
            });
        });

        tx.oncomplete = () => resolve();

        tx.onerror = e => reject(e);
    });
}

// ═══════════════════════════════════════
// LEER EXPEDIENTES
// ═══════════════════════════════════════
async function cargarExpedientesLocal() {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'expedientes',
            'readonly'
        );

        const store =
            tx.objectStore('expedientes');

        const request =
            store.getAll();

        request.onsuccess = () => {

            resolve(

                request.result

                    .sort(
                        (a, b) => a.id - b.id
                    )

                    .map(x => x.fila)
            );
        };

        request.onerror = reject;
    });
}

// ═══════════════════════════════════════
// ACTUALIZAR EXPEDIENTE LOCAL
// ═══════════════════════════════════════
async function actualizarExpedienteLocal(
    id,
    filaNueva
) {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'expedientes',
            'readwrite'
        );

        const store =
            tx.objectStore('expedientes');

        const request = store.put({

            id,

            fila:
                filaNueva
        });

        request.onsuccess = () => resolve();

        request.onerror = reject;
    });
}

// ═══════════════════════════════════════
// AGREGAR CAMBIO A QUEUE
// ═══════════════════════════════════════
async function agregarCambioQueue(data) {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'queue',
            'readwrite'
        );

        const store =
            tx.objectStore('queue');

        const request = store.put({

            ...data,

            synced: false,

            conflicto: false,

            createdAt:
                Date.now()
        });

        request.onsuccess = () => resolve();

        request.onerror = reject;
    });
}

// ═══════════════════════════════════════
// LEER QUEUE
// ═══════════════════════════════════════
async function obtenerQueuePendiente() {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'queue',
            'readonly'
        );

        const store =
            tx.objectStore('queue');

        const request =
            store.getAll();

        request.onsuccess = () => {

            resolve(

                request.result.filter(
                    x => !x.synced
                )
            );
        };

        request.onerror = reject;
    });
}

// ═══════════════════════════════════════
// ELIMINAR ITEM DE QUEUE
// ═══════════════════════════════════════
async function eliminarQueueItem(queueId) {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'queue',
            'readwrite'
        );

        const store =
            tx.objectStore('queue');

        const request =
            store.delete(queueId);

        request.onsuccess = () => resolve();

        request.onerror = reject;
    });
}

// ═══════════════════════════════════════
// EXPORTAR PENDIENTES
// ═══════════════════════════════════════
async function exportarPendientes(
    nombre = 'pendientes-sync.json'
) {

    const pendientes =
        await obtenerQueuePendiente();

    if (!pendientes.length) {
        return;
    }

    const blob = new Blob(

        [
            JSON.stringify(
                pendientes,
                null,
                2
            )
        ],

        {
            type:
                'application/json'
        }
    );

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement('a');

    a.href = url;

    a.download = nombre;

    a.click();

    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════
// REGISTRAR LOG LOCAL
// ═══════════════════════════════════════
async function registrarLog(log) {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'logs',
            'readwrite'
        );

        const store =
            tx.objectStore('logs');

        const request = store.put({

            ...log,

            createdAt:
                Date.now()
        });

        request.onsuccess = () => resolve();

        request.onerror = reject;
    });
}
