// Migration: Copy existing documents from backend/data/documents to Electron userData
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Find backend data directory
// From desktop/main/services -> desktop -> Lemona root -> backend/data/documents
const projectRoot = path.resolve(__dirname, '../../../..');
const backendDataDir = path.join(projectRoot, 'backend', 'data', 'documents');
const desktopDataDir = path.join(app.getPath('userData'), 'documents');
export async function migrateDocuments() {
    try {
        // Check if backend documents directory exists
        try {
            await fs.access(backendDataDir);
        }
        catch {
            console.log('No backend documents directory found, skipping migration');
            return 0;
        }
        // Ensure desktop documents directory exists
        await fs.mkdir(desktopDataDir, { recursive: true });
        // Get list of existing documents in desktop
        let existingFiles = [];
        try {
            existingFiles = await fs.readdir(desktopDataDir);
        }
        catch {
            // Directory doesn't exist yet, that's fine
        }
        // Read backend documents
        const backendFiles = await fs.readdir(backendDataDir);
        let migratedCount = 0;
        for (const file of backendFiles) {
            if (file.endsWith('.json')) {
                // Check if already migrated
                if (existingFiles.includes(file)) {
                    console.log(`Skipping ${file} - already exists in desktop`);
                    continue;
                }
                try {
                    const sourcePath = path.join(backendDataDir, file);
                    const destPath = path.join(desktopDataDir, file);
                    // Copy file
                    await fs.copyFile(sourcePath, destPath);
                    console.log(`Migrated document: ${file}`);
                    migratedCount++;
                }
                catch (error) {
                    console.error(`Failed to migrate ${file}:`, error);
                }
            }
        }
        if (migratedCount > 0) {
            console.log(`✅ Migrated ${migratedCount} document(s) from backend to desktop`);
        }
        return migratedCount;
    }
    catch (error) {
        console.error('Migration error:', error);
        return 0;
    }
}
