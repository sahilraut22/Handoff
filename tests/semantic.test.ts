import { describe, it, expect } from 'vitest';
import { detectLanguage, extractEntities, computeSemanticDiff, formatSemanticSummary, extractChangedNames } from '../src/lib/semantic.js';

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('foo.ts')).toBe('typescript');
    expect(detectLanguage('foo.tsx')).toBe('typescript');
    expect(detectLanguage('src/bar.mts')).toBe('typescript');
  });

  it('detects JavaScript', () => {
    expect(detectLanguage('foo.js')).toBe('javascript');
    expect(detectLanguage('foo.jsx')).toBe('javascript');
    expect(detectLanguage('foo.mjs')).toBe('javascript');
  });

  it('detects Python', () => {
    expect(detectLanguage('foo.py')).toBe('python');
  });

  it('detects Go', () => {
    expect(detectLanguage('main.go')).toBe('go');
  });

  it('detects Rust', () => {
    expect(detectLanguage('lib.rs')).toBe('rust');
  });

  it('detects Solidity', () => {
    expect(detectLanguage('Election.sol')).toBe('solidity');
  });

  it('returns unknown for unrecognized extensions', () => {
    expect(detectLanguage('file.cpp')).toBe('unknown');
    expect(detectLanguage('file.txt')).toBe('unknown');
  });
});

describe('extractEntities - TypeScript', () => {
  it('extracts functions', () => {
    const code = `
export function authenticate(token: string): boolean {
  return true;
}
export async function fetchUser(id: number) {
  return {};
}
`;
    const entities = extractEntities(code, 'typescript');
    const names = entities.map((e) => e.name);
    expect(names).toContain('authenticate');
    expect(names).toContain('fetchUser');
  });

  it('extracts classes and interfaces', () => {
    const code = `
export class AuthService {
  login() {}
}
export interface UserRepository {
  find(id: number): User;
}
export type UserId = string;
`;
    const entities = extractEntities(code, 'typescript');
    const names = entities.map((e) => e.name);
    expect(names).toContain('AuthService');
    expect(names).toContain('UserRepository');
    expect(names).toContain('UserId');
  });

  it('extracts arrow function constants', () => {
    const code = `const fetchData = async (url: string) => {
  return fetch(url);
};`;
    const entities = extractEntities(code, 'typescript');
    const names = entities.map((e) => e.name);
    expect(names).toContain('fetchData');
  });

  it('returns empty array for empty content', () => {
    expect(extractEntities('', 'typescript')).toEqual([]);
  });
});

describe('extractEntities - Python', () => {
  it('extracts functions and classes', () => {
    const code = `
def authenticate(token):
    return True

class UserService:
    def find_user(self, id):
        pass
`;
    const entities = extractEntities(code, 'python');
    const names = entities.map((e) => e.name);
    expect(names).toContain('authenticate');
    expect(names).toContain('UserService');
  });
});

describe('extractEntities - Go', () => {
  it('extracts functions and structs', () => {
    const code = `
func NewServer(addr string) *Server {
  return &Server{}
}

type Server struct {
  addr string
}

func (s *Server) Start() error {
  return nil
}
`;
    const entities = extractEntities(code, 'go');
    const names = entities.map((e) => e.name);
    expect(names).toContain('NewServer');
    expect(names).toContain('Server');
  });
});

describe('extractEntities - Solidity', () => {
  it('extracts contracts, functions, and events', () => {
    const code = `
contract Election {
    event VoteCast(address voter);

    function vote(uint candidateId) public {
    }

    modifier onlyOwner() {
    }
}
`;
    const entities = extractEntities(code, 'solidity');
    const names = entities.map((e) => e.name);
    expect(names).toContain('Election');
    expect(names).toContain('VoteCast');
    expect(names).toContain('vote');
    expect(names).toContain('onlyOwner');
  });
});

describe('computeSemanticDiff', () => {
  it('detects added functions', () => {
    const oldCode = `export function foo() {}\n`;
    const newCode = `export function foo() {}\nexport function bar() {}\n`;
    const diff = computeSemanticDiff(oldCode, newCode, 'test.ts');
    expect(diff.added.map((e) => e.name)).toContain('bar');
    expect(diff.removed).toHaveLength(0);
  });

  it('detects removed functions', () => {
    const oldCode = `export function foo() {}\nexport function bar() {}\n`;
    const newCode = `export function foo() {}\n`;
    const diff = computeSemanticDiff(oldCode, newCode, 'test.ts');
    expect(diff.removed.map((e) => e.name)).toContain('bar');
    expect(diff.added).toHaveLength(0);
  });

  it('handles unknown language gracefully', () => {
    const diff = computeSemanticDiff('hello', 'world', 'file.cpp');
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });
});

describe('formatSemanticSummary', () => {
  it('formats added and removed entities', () => {
    const diff = computeSemanticDiff(
      `export function foo() {}\n`,
      `export function foo() {}\nexport function bar() {}\n`,
      'test.ts'
    );
    const summary = formatSemanticSummary(diff);
    expect(summary).toContain('bar');
    expect(summary).toContain('Added');
  });

  it('returns default message when no changes', () => {
    const summary = formatSemanticSummary({ added: [], removed: [], modified: [] });
    expect(summary).toBe('No structural changes detected');
  });
});

describe('extractChangedNames', () => {
  it('extracts function names from diff', () => {
    const diff = `@@ -1,3 +1,4 @@
 export function foo() {}
+export function newFunc() {}
 export function bar() {}`;
    const names = extractChangedNames(diff, 'test.ts');
    expect(names).toContain('newFunc');
  });

  it('returns empty array for unknown language', () => {
    const names = extractChangedNames('+some code', 'file.cpp');
    expect(names).toEqual([]);
  });
});
