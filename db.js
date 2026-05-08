const DB_NAME = 'tactica-db';
const DB_VERSION = 1;

let db;

// INICIALIZAR DB
async function initDB() {

    return new Promise((resolve, reject) => {

        const request = indexedDB.open(
            DB_NAME,
            DB_VERSION
        );

        request.onupgradeneeded = e => {

            db = e.target.result;

            // EXPEDIENTES
            if (!db.objectStoreNames.contains('expedientes')) {

                db.createObjectStore(
                    'expedientes',
                    {
                        keyPath: 'id'
                    }
                );
            }

            // QUEUE
            if (!db.objectStoreNames.contains('queue')) {

                db.createObjectStore(
                    'queue',
                    {
                        keyPath: 'queueId',
                        autoIncrement: true
                    }
                );
            }

            // LOGS
            if (!db.objectStoreNames.contains('logs')) {

                db.createObjectStore(
                    'logs',
                    {
                        keyPath: 'logId',
                        autoIncrement: true
                    }
                );
            }
        };

        request.onsuccess = e => {

            db = e.target.result;
            resolve();
        };

        request.onerror = e => {

            console.error(e);
            reject(e);
        };
    });
}

// GUARDAR EXPEDIENTES
async function guardarExpedientesLocal(filas) {

    const tx = db.transaction(
        'expedientes',
        'readwrite'
    );

    const store = tx.objectStore('expedientes');

    await store.clear();

    filas.slice(1).forEach(f => {

        store.put({
            id: parseInt(f[0]),
            fila: f
        });
    });
}

// LEER EXPEDIENTES
async function cargarExpedientesLocal() {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'expedientes',
            'readonly'
        );

        const store = tx.objectStore('expedientes');

        const request = store.getAll();

        request.onsuccess = () => {

            resolve(
                request.result
                    .sort((a, b) => a.id - b.id)
                    .map(x => x.fila)
            );
        };

        request.onerror = reject;
    });
}

// AGREGAR CAMBIO A QUEUE
async function agregarCambioQueue(data) {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'queue',
            'readwrite'
        );

        const store = tx.objectStore('queue');

        const request = store.add({

            ...data,

            synced: false,

            conflicto: false,

            createdAt: Date.now()
        });

        request.onsuccess = () => resolve();

        request.onerror = reject;
    });
}

// LEER QUEUE
async function obtenerQueuePendiente() {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            'queue',
            'readonly'
        );

        const store = tx.objectStore('queue');

        const request = store.getAll();

        request.onsuccess = () => {

            resolve(
                request.result.filter(x => !x.synced)
            );
        };

        request.onerror = reject;
    });
}
// ACTUALIZAR EXPEDIENTE LOCAL
async function actualizarExpedienteLocal(id, filaNueva) {

    const tx = db.transaction(
        'expedientes',
        'readwrite'
    );

    const store = tx.objectStore('expedientes');

    store.put({
        id,
        fila: filaNueva
    });
}

// ELIMINAR ITEM DE QUEUE
async function eliminarQueueItem(queueId) {

    const tx = db.transaction(
        'queue',
        'readwrite'
    );

    const store = tx.objectStore('queue');

    store.delete(queueId);
}

// EXPORTAR PENDIENTES
async function exportarPendientes(nombre = 'pendientes-sync.json') {

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
            type: 'application/json'
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

// REGISTRAR LOG LOCAL
async function registrarLog(log) {

    const tx = db.transaction(
        'logs',
        'readwrite'
    );

    const store = tx.objectStore('logs');

    store.add({
        ...log,
        createdAt: Date.now()
    });
}
