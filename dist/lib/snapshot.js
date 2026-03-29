import { readdir, readFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, dirname } from 'node:path';
import { createReadStream } from 'node:fs';
import ignoreModule from 'ignore';
import { createTwoFilesPatch } from 'diff';
const MAX_SNAPSHOT_FILE_SIZE = 1024 * 1024; // 1MB
export async function walkFiles(dir, excludePatterns) {
    // ignore package exports differently in ESM vs CJS - handle both
    const ignoreFn = ignoreModule.default ?? ignoreModule;
    const ig = ignoreFn().add(excludePatterns);
    // Try to load .gitignore if present
    try {
        const gitignore = await readFile(join(dir, '.gitignore'), 'utf-8');
        ig.add(gitignore);
    }
    catch {
        // No .gitignore, that's fine
    }
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        const parentPath = entry.parentPath ?? entry.path;
        const fullPath = join(parentPath, entry.name);
        const relativePath = relative(dir, fullPath).replace(/\\/g, '/');
        if (!ig.ignores(relativePath)) {
            files.push(relativePath);
        }
    }
    return files.sort();
}
export async function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}
export async function hashAllFiles(dir, files, concurrency = 50) {
    const hashes = {};
    const queue = [...files];
    async function worker() {
        while (queue.length > 0) {
            const file = queue.shift();
            if (!file)
                break;
            try {
                hashes[file] = await hashFile(join(dir, file));
            }
            catch {
                // File may have been deleted between walk and hash
            }
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
    await Promise.all(workers);
    return hashes;
}
export async function isBinaryFile(filePath) {
    try {
        const fd = await readFile(filePath);
        const chunk = fd.subarray(0, 8192);
        for (const byte of chunk) {
            if (byte === 0)
                return true;
        }
        return false;
    }
    catch {
        return false;
    }
}
export async function snapshotFile(srcPath, snapshotDir, relativePath) {
    const destPath = join(snapshotDir, relativePath);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFile(srcPath, destPath);
}
export async function snapshotAllFiles(dir, files, snapshotDir, concurrency = 50) {
    const queue = [...files];
    async function worker() {
        while (queue.length > 0) {
            const file = queue.shift();
            if (!file)
                break;
            try {
                const filePath = join(dir, file);
                const fileStat = await stat(filePath);
                if (fileStat.size > MAX_SNAPSHOT_FILE_SIZE)
                    continue;
                const binary = await isBinaryFile(filePath);
                if (binary)
                    continue;
                await snapshotFile(filePath, snapshotDir, file);
            }
            catch {
                // Skip files that can't be snapshotted
            }
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
    await Promise.all(workers);
}
export function generateDiff(oldContent, newContent, filePath, contextLines) {
    return createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, oldContent, newContent, '', '', { context: contextLines });
}
function countDiffLines(diff) {
    let added = 0;
    let removed = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++'))
            added++;
        if (line.startsWith('-') && !line.startsWith('---'))
            removed++;
    }
    return { added, removed };
}
function truncateDiff(diff, maxLines) {
    const lines = diff.split('\n');
    const totalLines = lines.length;
    if (totalLines <= maxLines) {
        return { truncated: diff, totalLines, wasTruncated: false };
    }
    return {
        truncated: lines.slice(0, maxLines).join('\n'),
        totalLines,
        wasTruncated: true,
    };
}
export async function computeChanges(dir, snapshotDir, oldHashes, newHashes, config) {
    const changes = [];
    // Deleted files
    for (const filePath of Object.keys(oldHashes)) {
        if (!(filePath in newHashes)) {
            changes.push({ path: filePath, type: 'deleted' });
        }
    }
    // Added files
    for (const filePath of Object.keys(newHashes)) {
        if (!(filePath in oldHashes)) {
            const fullPath = join(dir, filePath);
            const binary = await isBinaryFile(fullPath);
            if (binary) {
                changes.push({ path: filePath, type: 'added', isBinary: true });
            }
            else {
                try {
                    const newContent = await readFile(fullPath, 'utf-8');
                    const diff = generateDiff('', newContent, filePath, config.diff_context_lines);
                    const { added, removed } = countDiffLines(diff);
                    changes.push({ path: filePath, type: 'added', diff, linesAdded: added, linesRemoved: removed });
                }
                catch {
                    changes.push({ path: filePath, type: 'added' });
                }
            }
        }
    }
    // Modified files
    for (const filePath of Object.keys(newHashes)) {
        if (filePath in oldHashes && newHashes[filePath] !== oldHashes[filePath]) {
            const fullPath = join(dir, filePath);
            const binary = await isBinaryFile(fullPath);
            if (binary) {
                changes.push({ path: filePath, type: 'modified', isBinary: true });
                continue;
            }
            try {
                const snapshotPath = join(snapshotDir, filePath);
                const oldContent = await readFile(snapshotPath, 'utf-8');
                const newContent = await readFile(fullPath, 'utf-8');
                const diff = generateDiff(oldContent, newContent, filePath, config.diff_context_lines);
                const { added, removed } = countDiffLines(diff);
                changes.push({ path: filePath, type: 'modified', diff, linesAdded: added, linesRemoved: removed });
            }
            catch {
                changes.push({ path: filePath, type: 'modified' });
            }
        }
    }
    return changes.sort((a, b) => a.path.localeCompare(b.path));
}
export { truncateDiff, countDiffLines };
//# sourceMappingURL=snapshot.js.map