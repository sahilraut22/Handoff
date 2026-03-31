/**
 * Technology signature detector.
 * Scans project files (package.json, imports, docker-compose, .env)
 * to build a map of which technology stack is currently in use per category.
 *
 * This enables state-based decision extraction: when the tech stack changes
 * between exports, we can auto-generate a decision recording the switch.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
const CATEGORIES = {
    database: {
        label: 'database',
        tag: 'database',
        patterns: [
            'mongodb', 'mongoose', 'mysql', 'mysql2', 'pg', 'postgres', 'postgresql',
            'sqlite3', 'better-sqlite3', 'libsql', 'turso', 'redis', 'ioredis',
            'cassandra', 'cassandra-driver', 'couchdb', 'nano', 'dynamodb',
            'aws-sdk', 'firebase', 'firestore', '@google-cloud/firestore',
            'supabase', '@supabase/supabase-js', 'planetscale', 'neon', '@neondatabase/serverless',
            'elasticsearch', '@elastic/elasticsearch', 'influxdb', 'memcached',
        ],
    },
    orm: {
        label: 'ORM / query builder',
        tag: 'database',
        patterns: [
            'prisma', '@prisma/client', 'typeorm', 'sequelize', 'drizzle-orm',
            'knex', 'objection', 'mikro-orm', '@mikro-orm/core', 'bookshelf',
            'waterline', 'massive', 'slonik',
        ],
    },
    framework: {
        label: 'backend framework',
        tag: 'architecture',
        patterns: [
            'express', 'fastify', 'koa', '@koa/router', 'hapi', '@hapi/hapi',
            'nestjs', '@nestjs/core', 'hono', 'elysia', 'polka', 'restify',
            'feathers', '@feathersjs/feathers', 'loopback', '@loopback/core',
        ],
    },
    frontend: {
        label: 'frontend framework',
        tag: 'architecture',
        patterns: [
            'react', 'react-dom', 'vue', '@vue/core', 'angular', '@angular/core',
            'svelte', 'solid-js', 'preact', 'lit', 'ember-source', 'alpinejs',
            'htmx.org',
        ],
    },
    meta_framework: {
        label: 'meta-framework',
        tag: 'architecture',
        patterns: [
            'next', 'nuxt', 'remix', '@remix-run/node', 'sveltekit', '@sveltejs/kit',
            'astro', 'gatsby', 'vite', '@vitejs/plugin-react', 'qwik', '@builder.io/qwik',
        ],
    },
    auth: {
        label: 'auth library',
        tag: 'security',
        patterns: [
            'passport', 'passport-jwt', 'jsonwebtoken', 'jose', 'jwt-decode',
            'auth0', '@auth0/auth0-spa-js', 'clerk', '@clerk/nextjs',
            'next-auth', 'better-auth', 'lucia', 'supertokens-node',
            'bcrypt', 'bcryptjs', 'argon2', 'oauth2orize',
        ],
    },
    testing: {
        label: 'testing framework',
        tag: 'tooling',
        patterns: [
            'jest', 'vitest', 'mocha', 'jasmine', 'ava', 'tap', 'uvu',
            'cypress', 'playwright', '@playwright/test', 'puppeteer', 'nightwatch',
            'testing-library', '@testing-library/react', 'supertest',
        ],
    },
    bundler: {
        label: 'bundler',
        tag: 'tooling',
        patterns: [
            'webpack', 'vite', 'rollup', 'esbuild', 'parcel', 'turbopack',
            'rspack', '@rspack/core', 'snowpack', 'microbundle',
        ],
    },
    state: {
        label: 'state management',
        tag: 'architecture',
        patterns: [
            'redux', '@reduxjs/toolkit', 'zustand', 'mobx', 'mobx-state-tree',
            'jotai', 'recoil', 'pinia', 'xstate', 'valtio', 'effector', 'nanostores',
        ],
    },
    http_client: {
        label: 'HTTP client',
        tag: 'dependency',
        patterns: [
            'axios', 'got', 'node-fetch', 'undici', 'ky', 'superagent',
            'needle', 'cross-fetch', 'isomorphic-fetch',
        ],
    },
    css: {
        label: 'CSS framework',
        tag: 'frontend',
        patterns: [
            'tailwindcss', 'styled-components', '@emotion/react', '@emotion/styled',
            'sass', 'less', 'postcss', '@stitches/react', 'vanilla-extract',
            '@vanilla-extract/css', 'unocss', 'windicss', 'bootstrap',
            '@mui/material', 'antd', '@chakra-ui/react', 'mantine',
        ],
    },
    queue: {
        label: 'message queue / job queue',
        tag: 'infrastructure',
        patterns: [
            'bull', 'bullmq', 'bee-queue', 'amqplib', 'kafkajs',
            'rabbitmq', 'nats', 'aws-sqs', '@google-cloud/pubsub',
        ],
    },
};
// Source file extensions to scan for imports
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rb']);
// Directories to skip when scanning imports
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt']);
/**
 * Detect technologies from package.json dependencies.
 */
async function detectFromPackageJson(workingDir) {
    const found = {};
    try {
        const content = await readFile(join(workingDir, 'package.json'), 'utf-8');
        const pkg = JSON.parse(content);
        const allDeps = {
            ...(pkg['dependencies'] ?? {}),
            ...(pkg['devDependencies'] ?? {}),
        };
        const depNames = Object.keys(allDeps).map((d) => d.toLowerCase());
        for (const [cat, { patterns }] of Object.entries(CATEGORIES)) {
            const matches = patterns.filter((p) => depNames.some((d) => d === p || d.startsWith(p + '/')));
            if (matches.length > 0) {
                found[cat] = [...(found[cat] ?? []), ...matches];
            }
        }
    }
    catch {
        // package.json missing or not parseable — skip
    }
    return found;
}
/**
 * Detect technologies from a requirements.txt / pyproject.toml (Python projects).
 */
async function detectFromPythonDeps(workingDir) {
    const found = {};
    try {
        const content = await readFile(join(workingDir, 'requirements.txt'), 'utf-8');
        const deps = content.split('\n')
            .map((l) => l.split(/[>=<!=]/)[0]?.trim().toLowerCase())
            .filter(Boolean);
        for (const [cat, { patterns }] of Object.entries(CATEGORIES)) {
            const matches = patterns.filter((p) => deps.some((d) => d === p));
            if (matches.length > 0) {
                found[cat] = [...(found[cat] ?? []), ...matches];
            }
        }
    }
    catch {
        // not a python project
    }
    return found;
}
/**
 * Detect technologies from docker-compose.yml service images.
 */
async function detectFromDockerCompose(workingDir) {
    const found = {};
    for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
        try {
            const content = await readFile(join(workingDir, name), 'utf-8');
            // Simple image: line extraction without a full YAML parser
            const images = [...content.matchAll(/image:\s*['"]?([^\s'"]+)/g)]
                .map((m) => m[1].toLowerCase().split(':')[0].split('/').pop());
            for (const [cat, { patterns }] of Object.entries(CATEGORIES)) {
                const matches = patterns.filter((p) => images.some((img) => img === p || img.startsWith(p)));
                if (matches.length > 0) {
                    found[cat] = [...(found[cat] ?? []), ...matches];
                }
            }
            break;
        }
        catch {
            // try next filename
        }
    }
    return found;
}
/**
 * Detect technologies from .env connection URL patterns.
 * e.g. DATABASE_URL=mysql://... → mysql
 */
async function detectFromEnvFile(workingDir) {
    const found = {};
    const URL_TECH_MAP = {
        'mongodb': 'mongodb', 'mongodb+srv': 'mongodb',
        'mysql': 'mysql2', 'mariadb': 'mysql2',
        'postgres': 'pg', 'postgresql': 'pg',
        'redis': 'redis', 'rediss': 'redis',
        'sqlite': 'sqlite3',
        'couchdb': 'couchdb',
        'cassandra': 'cassandra-driver',
        'elasticsearch': 'elasticsearch',
    };
    for (const name of ['.env', '.env.local', '.env.development', '.env.example']) {
        try {
            const content = await readFile(join(workingDir, name), 'utf-8');
            for (const match of content.matchAll(/=\s*([a-z][a-z0-9+.-]+):\/\//gi)) {
                const scheme = match[1].toLowerCase();
                const tech = URL_TECH_MAP[scheme];
                if (tech) {
                    found['database'] = [...new Set([...(found['database'] ?? []), tech])];
                }
            }
        }
        catch {
            // env file missing
        }
    }
    return found;
}
/**
 * Scan source files for import statements to detect tech usage in code.
 * Catches cases where a package is imported but not (yet) in package.json.
 */
async function detectFromImports(workingDir) {
    const found = {};
    const allPatterns = new Map();
    for (const [cat, { patterns }] of Object.entries(CATEGORIES)) {
        for (const p of patterns) {
            allPatterns.set(p, cat);
        }
    }
    async function scanDir(dir) {
        let entries;
        try {
            entries = await readdir(dir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry))
                continue;
            const full = join(dir, entry);
            const ext = extname(entry).toLowerCase();
            if (SOURCE_EXTS.has(ext)) {
                try {
                    const content = await readFile(full, 'utf-8');
                    // Match: import ... from 'pkg', require('pkg'), from "pkg"
                    const importMatches = [
                        ...content.matchAll(/from\s+['"]([^'"]+)['"]/g),
                        ...content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
                        ...content.matchAll(/import\s*['"]([^'"]+)['"]/g),
                    ];
                    for (const m of importMatches) {
                        const pkg = m[1].toLowerCase().split('/').slice(0, 2).join('/');
                        const cat = allPatterns.get(pkg) ?? allPatterns.get(pkg.split('/')[0]);
                        if (cat) {
                            const canonical = allPatterns.has(pkg) ? pkg : pkg.split('/')[0];
                            found[cat] = [...new Set([...(found[cat] ?? []), canonical])];
                        }
                    }
                }
                catch {
                    // unreadable file, skip
                }
            }
            else {
                // recurse into directories
                try {
                    const stat = await import('node:fs/promises').then((m) => m.stat(full));
                    if (stat.isDirectory())
                        await scanDir(full);
                }
                catch {
                    // skip
                }
            }
        }
    }
    // Only scan src/ if it exists, otherwise scan root (but limit depth implicitly)
    for (const scanRoot of ['src', 'app', 'lib', 'server', '.']) {
        try {
            await import('node:fs/promises').then((m) => m.access(join(workingDir, scanRoot)));
            await scanDir(join(workingDir, scanRoot));
            if (scanRoot !== '.')
                break; // found a src-like dir, stop
        }
        catch {
            // dir doesn't exist
        }
    }
    return found;
}
/**
 * Merge multiple detection results, deduplicating per category.
 */
function mergeDetections(...sources) {
    const merged = {};
    for (const source of sources) {
        for (const [cat, techs] of Object.entries(source)) {
            merged[cat] = [...new Set([...(merged[cat] ?? []), ...techs])];
        }
    }
    return merged;
}
/**
 * Build a complete technology snapshot for the current project state.
 * Combines package.json, imports, docker-compose, .env detection.
 */
export async function buildTechSnapshot(workingDir) {
    const [fromPkg, fromPy, fromDocker, fromEnv, fromImports] = await Promise.all([
        detectFromPackageJson(workingDir),
        detectFromPythonDeps(workingDir),
        detectFromDockerCompose(workingDir),
        detectFromEnvFile(workingDir),
        detectFromImports(workingDir),
    ]);
    const techs = mergeDetections(fromPkg, fromPy, fromDocker, fromEnv, fromImports);
    // Remove empty categories
    for (const cat of Object.keys(techs)) {
        if (techs[cat].length === 0)
            delete techs[cat];
    }
    return { timestamp: new Date().toISOString(), techs };
}
/**
 * Get the human-readable label for a category.
 */
export function getCategoryLabel(category) {
    return CATEGORIES[category]?.label ?? category;
}
/**
 * Get the tag for a category (for decision tagging).
 */
export function getCategoryTag(category) {
    return CATEGORIES[category]?.tag ?? category;
}
//# sourceMappingURL=tech-detector.js.map