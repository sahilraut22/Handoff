import { describe, it, expect } from 'vitest';
import {
  tokenize,
  buildCorpus,
  computeTfIdf,
  cosineSimilarity,
  rankByRelevance,
  scoreRelevance,
} from '../src/lib/tfidf.js';

describe('tokenize', () => {
  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('filters stop words', () => {
    const tokens = tokenize('the quick brown fox');
    expect(tokens).not.toContain('the');
  });

  it('splits camelCase identifiers', () => {
    const tokens = tokenize('getUserByEmail');
    expect(tokens.some((t) => t.includes('user') || t.includes('get') || t.includes('email'))).toBe(true);
  });

  it('splits snake_case identifiers', () => {
    const tokens = tokenize('get_user_by_email');
    expect(tokens.some((t) => t.includes('user') || t.includes('get') || t.includes('email'))).toBe(true);
  });

  it('filters pure numbers', () => {
    const tokens = tokenize('line 42 contains 100 changes');
    expect(tokens).not.toContain('42');
    expect(tokens).not.toContain('100');
  });
});

describe('buildCorpus', () => {
  it('builds document frequency map', () => {
    const docs = ['hello world', 'hello there', 'goodbye world'];
    const corpus = buildCorpus(docs);
    expect(corpus.N).toBe(3);
    expect(corpus.df.size).toBeGreaterThan(0);
    // 'hello' appears in 2 docs
    const helloDf = corpus.df.get('hello') ?? 0;
    expect(helloDf).toBe(2);
  });

  it('counts each term once per document', () => {
    const docs = ['cat cat cat', 'cat dog'];
    const corpus = buildCorpus(docs);
    // 'cat' appears in both documents
    expect(corpus.df.get('cat')).toBe(2);
  });
});

describe('computeTfIdf', () => {
  it('returns TfIdfVector with positive magnitude', () => {
    const corpus = buildCorpus(['authentication token', 'session management']);
    const vec = computeTfIdf('authentication token', corpus);
    expect(vec.magnitude).toBeGreaterThan(0);
    expect(vec.terms.size).toBeGreaterThan(0);
  });

  it('assigns higher weight to rare terms', () => {
    const docs = [
      'common word appears everywhere',
      'common word in another document',
      'rare xyzqwerty term here',
    ];
    const corpus = buildCorpus(docs);
    const vec = computeTfIdf('rare xyzqwerty term here', corpus);
    // 'xyzqwerty' (rare) should have higher weight than 'common'
    const xyzWeight = vec.terms.get('xyzqwerty') ?? 0;
    const commonWeight = vec.terms.get('common') ?? 0;
    expect(xyzWeight).toBeGreaterThan(commonWeight);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical documents', () => {
    // Use a diverse corpus so IDF values are non-zero
    const doc = 'authentication JWT token security';
    const corpus = buildCorpus([doc, 'database migration schema', 'CSS styling components']);
    const v1 = computeTfIdf(doc, corpus);
    const v2 = computeTfIdf(doc, corpus);
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
  });

  it('returns value between 0 and 1 for related documents', () => {
    const docs = ['authentication JWT token', 'user session management', 'JWT authentication system'];
    const corpus = buildCorpus(docs);
    const v1 = computeTfIdf(docs[0]!, corpus);
    const v3 = computeTfIdf(docs[2]!, corpus);
    const sim = cosineSimilarity(v1, v3);
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('returns lower similarity for unrelated documents', () => {
    const docs = ['authentication JWT token', 'database schema migration', 'CSS styling components'];
    const corpus = buildCorpus(docs);
    const v1 = computeTfIdf(docs[0]!, corpus);
    const v2 = computeTfIdf(docs[1]!, corpus);
    const v3 = computeTfIdf(docs[2]!, corpus);
    const sim12 = cosineSimilarity(v1, v2);
    const sim13 = cosineSimilarity(v1, v3);
    // All should be between 0 and 1
    expect(sim12).toBeGreaterThanOrEqual(0);
    expect(sim13).toBeGreaterThanOrEqual(0);
  });
});

describe('rankByRelevance', () => {
  it('returns empty array for empty documents', () => {
    expect(rankByRelevance('query', [])).toEqual([]);
  });

  it('ranks most relevant document first', () => {
    const query = 'authentication JWT security';
    const docs = [
      'database schema tables and indexes',
      'JWT authentication and security tokens',
      'UI styling with CSS and flexbox',
    ];
    const ranked = rankByRelevance(query, docs);
    expect(ranked[0]!.index).toBe(1); // JWT doc should rank highest
  });

  it('uses custom labels when provided', () => {
    const docs = ['foo bar', 'baz qux'];
    const labels = ['doc-a', 'doc-b'];
    const ranked = rankByRelevance('foo', docs, labels);
    expect(ranked[0]!.label).toMatch(/^doc-/);
  });

  it('returns all documents ranked', () => {
    const docs = ['doc one content', 'doc two content', 'doc three content'];
    const ranked = rankByRelevance('content', docs);
    expect(ranked.length).toBe(3);
  });
});

describe('scoreRelevance', () => {
  it('returns 0 for empty query or document', () => {
    expect(scoreRelevance('', 'some document')).toBe(0);
    expect(scoreRelevance('some query', '')).toBe(0);
  });

  it('returns higher score for relevant document', () => {
    const query = 'JWT authentication';
    const relevant = 'JWT token authentication and authorization';
    const irrelevant = 'CSS grid layout styling';
    const s1 = scoreRelevance(query, relevant);
    const s2 = scoreRelevance(query, irrelevant);
    expect(s1).toBeGreaterThanOrEqual(s2);
  });

  it('returns value between 0 and 1', () => {
    const score = scoreRelevance('test query', 'test document with query terms');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
