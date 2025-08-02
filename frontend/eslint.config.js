import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginReactConfig from 'eslint-plugin-react/configs/recommended.js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // 全局忽略配置
  {
    ignores: [
      'dist/',
      'wailsjs/',
      'eslint.config.js',
      'vite.config.ts',
      'postcss.config.mjs',
      '.lintstagedrc.js',
    ],
  },

  // 全局文件和语言选项
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parser: tseslint.parser, // 明确指定使用 TS 解析器
      parserOptions: {
        ecmaFeatures: { jsx: true },
        // 这会告诉 ESLint 去查找当前目录下的 tsconfig.json
        project: true,
        // 告诉解析器 tsconfig.json 文件的根目录在哪里
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Typescript 推荐规则
  ...tseslint.configs.recommendedTypeChecked, // 使用包含类型检查的规则集

  // 添加规则配置
  {
    rules: {
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error', // 新增规则
    },
  },

  // React 相关配置
  {
    ...pluginReactConfig,
    // 告诉 ESLint 我们使用新的 JSX Transform
    rules: {
      // React 17 及更高版本
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // React Hooks 和 Refresh 插件
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
    },
  },

  // Prettier 配置必须放在最后
  prettierConfig
)
