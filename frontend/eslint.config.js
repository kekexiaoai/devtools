import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginReactConfig from 'eslint-plugin-react/configs/recommended.js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // 全局忽略配置
  {
    // 忽略 dist (构建产物) 和 wailsjs (自动生成) 目录
    ignores: ['dist', 'wailsjs'],
  },

  // 全局文件和语言选项
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true }, // 明确开启JSX解析
      },
    },
  },

  // Typescript 推荐规则
  ...tseslint.configs.recommended,

  // React 相关配置
  {
    ...pluginReactConfig,
    settings: {
      react: {
        version: 'detect', // 自动检测 React 版本
      },
    },
    // 告诉 ESLint 我们使用新的 JSX Transform
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'], // 只对 ts/tsx 文件应用 react-hooks
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
