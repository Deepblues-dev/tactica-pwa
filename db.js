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

    const tx = db.transaction(
        'queue',
        'readwrite'
    );

    const store = tx.objectStore('queue');

    store.add({
        ...data,
        synced: false,
        createdAt: Date.now()
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
