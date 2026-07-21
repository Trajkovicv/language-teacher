import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// .env liegt im Projekt-Root. Als eigenes Modul, damit jede Datei, die env-Werte
// liest, dieses Modul importieren kann und die Ladereihenfolge stimmt (ESM-Hoisting).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
