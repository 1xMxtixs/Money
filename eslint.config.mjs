import fs from 'node:fs';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importXPlugin from 'eslint-plugin-import-x';
import nextPlugin from '@next/eslint-plugin-next';

const ALL_FEATURES = fs.existsSync('features')
  ? fs
      .readdirSync('features', { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];

const RECHARTS_PATHS = [
  {
    name: 'recharts',
    message:
      'recharts must only be imported in features/stats to protect the 200KB bundle budget (Rule 6 / CD-07 / RNF-RE-04 / AGENTS.md §E).',
  },
];

const RECHARTS_PATTERNS = [
  {
    group: ['recharts', 'recharts/*'],
    message:
      'recharts must only be imported in features/stats to protect the 200KB bundle budget (Rule 6 / CD-07 / RNF-RE-04 / AGENTS.md §E).',
  },
];

const DB_RESTRICTED_PATHS = [
  {
    name: '@/lib/db',
    message:
      'lib/db must not be imported outside lib/repos/** (AD-11 / AGENTS.md §E). Always use lib/repos.',
  },
];

const DB_RESTRICTED_PATTERNS = [
  {
    group: [
      '@/lib/db',
      '@/lib/db/*',
      '@/lib/db/**',
      '../lib/db',
      '../lib/db/**',
      '../../lib/db/**',
      '**/lib/db',
      '**/lib/db/**',
      './db',
      './db/**',
      '../db',
      '../db/**',
      '../../db/**',
    ],
    message:
      'lib/db must not be imported outside lib/repos/** (AD-11 / AGENTS.md §E). Always use lib/repos.',
  },
];

const localMoneyPlugin = {
  rules: {
    'no-amount-arithmetic': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Disallow direct money arithmetic operations outside lib/domain/money (Rule 5 / RA-06 / AGENTS.md §E).',
        },
        schema: [],
        messages: {
          noHardcodedScaling:
            'Hardcoded currency scaling (* 100, / 100, etc.) is prohibited outside lib/domain/money (Rule 5 / RA-06 / AGENTS.md §E). Use lib/domain/money functions instead.',
          noAmountArithmetic:
            'Arithmetic operations on amount/money identifiers ("{{identifier}}") are prohibited outside lib/domain/money (Rule 5 / RA-06 / AGENTS.md §E). Use lib/domain/money functions instead.',
        },
      },
      create(context) {
        const filename = context.filename || context.getFilename?.() || '';
        const normalizedPath = filename.replace(/\\/g, '/');

        // Permitted inside lib/domain/money/**, configs, scripts, and tests
        if (
          normalizedPath.includes('lib/domain/money') ||
          normalizedPath.includes('.config.') ||
          normalizedPath.includes('/scripts/') ||
          normalizedPath.includes('scripts/') ||
          normalizedPath.includes('/tests/') ||
          normalizedPath.includes('tests/') ||
          normalizedPath.includes('.test.') ||
          normalizedPath.includes('.spec.')
        ) {
          return {};
        }

        function isScalingLiteral(node) {
          if (!node) return false;
          if (node.type === 'Literal') {
            const val = node.value;
            return (
              val === 100 ||
              val === 1000 ||
              val === 0.01 ||
              val === 0.001 ||
              val === 100n ||
              val === 1000n
            );
          }
          return false;
        }

        function getAmountIdentifier(node) {
          if (!node) return null;
          if (node.type === 'Identifier') {
            if (/amount|minor|balance|rate/i.test(node.name)) {
              return node.name;
            }
          }
          if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
            if (/amount|minor|balance|rate/i.test(node.property.name)) {
              return node.property.name;
            }
          }
          return null;
        }

        return {
          BinaryExpression(node) {
            const arithmeticOps = ['*', '/', '+', '-', '%'];
            if (!arithmeticOps.includes(node.operator)) return;

            // Check 1: * 100, / 100, etc.
            if (
              (node.operator === '*' || node.operator === '/') &&
              (isScalingLiteral(node.left) || isScalingLiteral(node.right))
            ) {
              context.report({
                node,
                messageId: 'noHardcodedScaling',
              });
              return;
            }

            // Check 2: Arithmetic on amount/balance/minor/rate identifiers
            const leftId = getAmountIdentifier(node.left);
            const rightId = getAmountIdentifier(node.right);
            const matched = leftId || rightId;
            if (matched) {
              context.report({
                node,
                messageId: 'noAmountArithmetic',
                data: { identifier: matched },
              });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  // Ignored paths
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      '*.tsbuildinfo',
      '.atl/**',
      'next-env.d.ts',
      '**/*.d.ts',
      '**/__lint-fixtures__/**',
    ],
  },

  // Base JS & TS recommendations
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global settings & plugins
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      'import-x': importXPlugin,
      '@next/next': nextPlugin,
      money: localMoneyPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: true,
      },
    },
    rules: {
      'no-restricted-imports': 'off',

      // Criterion 2: react/no-danger in error mode without exception
      'react/no-danger': 'error',

      // Criterion 3: eslint-plugin-jsx-a11y active
      ...jsxA11yPlugin.configs.recommended.rules,

      // Next.js recommended rules
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,

      // React hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Criterion 4 & Rule 7: Disallow default exports across project by default
      'import-x/no-default-export': 'error',

      // Rule 5: Disallow direct money arithmetic outside lib/domain/money (RA-06)
      'money/no-amount-arithmetic': 'error',

      // Rule 6: Disallow recharts by default
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: RECHARTS_PATHS,
          patterns: RECHARTS_PATTERNS,
        },
      ],

      // Import boundary path restrictions (import-x zones)
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            // Rule 1: lib/domain must not import next, app, or lib/db
            {
              target: './lib/domain',
              from: './app',
              message:
                'lib/domain/** must not import from app/** (Rule 1 / doc 3 §12 / AGENTS.md §E).',
            },
            {
              target: './lib/domain',
              from: './lib/db',
              message:
                'lib/domain/** must not import from lib/db/** (Rule 1 / doc 3 §12 / AGENTS.md §E).',
            },
            // AD-11 / Rule 2: lib/db must not be imported anywhere outside lib/repos/**
            {
              target: [
                './app',
                './components',
                './features',
                './lib/domain',
                './lib/format',
                './lib/i18n',
                './lib/schemas',
                './lib/stores',
                './lib/auth',
                './lib/api',
                './lib/observability',
                './tests',
              ],
              from: './lib/db',
              message:
                'lib/db must not be imported outside lib/repos/** (AD-11 / AGENTS.md §E). Always use lib/repos.',
            },
            // Rule 3: components must not import features
            {
              target: './components',
              from: './features',
              message:
                'components/** must not import from features/** (Rule 3 / CD-01 / AGENTS.md §E).',
            },
            // Rule 4: Cross-feature isolation (features/a cannot import features/b)
            ...ALL_FEATURES.map((feat) => ({
              target: `./features/${feat}`,
              from: './features',
              except: [`./${feat}`],
              message: `features/${feat} cannot import from other features (Rule 4 / CD-01 / AGENTS.md §E). Share via components/ or lib/.`,
            })),
          ],
        },
      ],
    },
  },

  // AD-11 / Rule 2: Prohibit importing lib/db anywhere outside lib/repos/**, lib/db/**, scripts/**, and config
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: [
      '**/lib/repos/**',
      'lib/repos/**',
      '**/lib/db/**',
      'lib/db/**',
      '**/scripts/**',
      'scripts/**',
      '*.config.{js,mjs,cjs,ts}',
      'drizzle.config.{js,mjs,cjs,ts}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [...RECHARTS_PATHS, ...DB_RESTRICTED_PATHS],
          patterns: [...RECHARTS_PATTERNS, ...DB_RESTRICTED_PATTERNS],
        },
      ],
    },
  },

  // Rule 1 specific restrictions on lib/domain/**
  {
    files: [
      '**/lib/domain/**/*.{js,mjs,cjs,ts,tsx}',
      'lib/domain/**/*.{js,mjs,cjs,ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            ...RECHARTS_PATHS,
            ...DB_RESTRICTED_PATHS,
            {
              name: 'next',
              message:
                'lib/domain/** must not import next (Rule 1 / doc 3 §12 / AGENTS.md §E).',
            },
          ],
          patterns: [
            ...RECHARTS_PATTERNS,
            ...DB_RESTRICTED_PATTERNS,
            {
              group: [
                'next/*',
                '@/app',
                '@/app/*',
                '@/app/**',
                '../app/**',
                '../../app/**',
                '**/app/**',
              ],
              message:
                'lib/domain/** must not import next/* or app/* (Rule 1 / doc 3 §12 / AGENTS.md §E).',
            },
          ],
        },
      ],
    },
  },

  // Rule 3 specific restrictions on components/**
  {
    files: [
      '**/components/**/*.{js,mjs,cjs,ts,tsx}',
      'components/**/*.{js,mjs,cjs,ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            ...RECHARTS_PATHS,
            ...DB_RESTRICTED_PATHS,
            {
              name: '@/features',
              message:
                'components/** must not import from features/** (Rule 3 / CD-01 / AGENTS.md §E).',
            },
          ],
          patterns: [
            ...RECHARTS_PATTERNS,
            ...DB_RESTRICTED_PATTERNS,
            {
              group: [
                '@/features/*',
                '@/features/**',
                '../features/**',
                '../../features/**',
                '**/features/**',
              ],
              message:
                'components/** must not import from features/** (Rule 3 / CD-01 / AGENTS.md §E).',
            },
          ],
        },
      ],
    },
  },

  // Rule 4 specific per-feature restrictions
  ...ALL_FEATURES.map((feat) => ({
    files: [
      `**/features/${feat}/**/*.{js,mjs,cjs,ts,tsx}`,
      `features/${feat}/**/*.{js,mjs,cjs,ts,tsx}`,
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            ...(feat === 'stats' ? [] : RECHARTS_PATHS),
            ...DB_RESTRICTED_PATHS,
          ],
          patterns: [
            ...(feat === 'stats' ? [] : RECHARTS_PATTERNS),
            ...DB_RESTRICTED_PATTERNS,
            {
              group: ALL_FEATURES.filter((f) => f !== feat).flatMap((f) => [
                `@/features/${f}`,
                `@/features/${f}/*`,
                `@/features/${f}/**`,
                `../${f}`,
                `../${f}/*`,
                `../${f}/**`,
                `../../${f}`,
                `../../${f}/*`,
                `../../${f}/**`,
              ]),
              message: `features/${feat} must not import from other features (Rule 4 / CD-01 / AGENTS.md §E). Share via components/ or lib/.`,
            },
          ],
        },
      ],
    },
  })),

  // Allowed default exports: Next.js special files & configuration files
  {
    files: [
      '**/app/**/{page,layout,route,not-found,loading,error,template,default,global-error}.{js,mjs,cjs,ts,tsx}',
      'app/**/{page,layout,route,not-found,loading,error,template,default,global-error}.{js,mjs,cjs,ts,tsx}',
      '*.config.{js,mjs,cjs,ts}',
      'next.config.{js,mjs,cjs,ts}',
      'postcss.config.{js,mjs,cjs,ts}',
      'tailwind.config.{js,mjs,cjs,ts}',
      'eslint.config.{js,mjs,cjs,ts}',
    ],
    rules: {
      'import-x/no-default-export': 'off',
    },
  }
);
