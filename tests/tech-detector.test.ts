import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { buildTechSnapshot, getCategoryLabel, getCategoryTag } from '../src/lib/tech-detector.js';

describe('buildTechSnapshot', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-techdetect-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty techs for empty project', async () => {
    const snap = await buildTechSnapshot(tmpDir);
    expect(snap.techs).toEqual({});
    expect(snap.timestamp).toBeTruthy();
  });

  it('detects database from package.json', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { mongodb: '^6.0.0', express: '^4.0.0' },
    }));
    const snap = await buildTechSnapshot(tmpDir);
    expect(snap.techs['database']).toContain('mongodb');
    expect(snap.techs['framework']).toContain('express');
  });

  it('detects ORM alongside database', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { mysql2: '^3.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0' },
    }));
    const snap = await buildTechSnapshot(tmpDir);
    expect(snap.techs['database']).toContain('mysql2');
    expect(snap.techs['orm']).toContain('prisma');
  });

  it('detects auth library', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { jsonwebtoken: '^9.0.0', bcryptjs: '^2.0.0' },
    }));
    const snap = await buildTechSnapshot(tmpDir);
    expect(snap.techs['auth']).toBeDefined();
    expect(snap.techs['auth']!.some((t) => t.includes('jsonwebtoken') || t.includes('bcryptjs'))).toBe(true);
  });

  it('detects tech from import statements in src/', async () => {
    await mkdir(join(tmpDir, 'src'));
    await writeFile(join(tmpDir, 'src', 'db.ts'), `
      import { MongoClient } from 'mongodb';
      const client = new MongoClient(process.env.MONGODB_URI);
    `);
    const snap = await buildTechSnapshot(tmpDir);
    expect(snap.techs['database']).toContain('mongodb');
  });

  it('detects database from .env connection URL', async () => {
    await writeFile(join(tmpDir, '.env'), 'DATABASE_URL=mysql://user:pass@localhost/db\n');
    const snap = await buildTechSnapshot(tmpDir);
    expect(snap.techs['database']).toContain('mysql2');
  });

  it('detects multiple categories simultaneously', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        pg: '^8.0.0',
        prisma: '^5.0.0',
        vitest: '^1.0.0',
        tailwindcss: '^3.0.0',
      },
    }));
    const snap = await buildTechSnapshot(tmpDir);
    expect(snap.techs['frontend']).toContain('react');
    expect(snap.techs['database']).toContain('pg');
    expect(snap.techs['orm']).toContain('prisma');
    expect(snap.techs['testing']).toContain('vitest');
    expect(snap.techs['css']).toContain('tailwindcss');
  });
});

describe('getCategoryLabel', () => {
  it('returns human label for known category', () => {
    expect(getCategoryLabel('database')).toBe('database');
    expect(getCategoryLabel('orm')).toBe('ORM / query builder');
    expect(getCategoryLabel('framework')).toBe('backend framework');
  });

  it('returns the category itself for unknown categories', () => {
    expect(getCategoryLabel('unknown-cat')).toBe('unknown-cat');
  });
});

describe('getCategoryTag', () => {
  it('returns correct tag for known categories', () => {
    expect(getCategoryTag('database')).toBe('database');
    expect(getCategoryTag('auth')).toBe('security');
    expect(getCategoryTag('framework')).toBe('architecture');
  });
});
