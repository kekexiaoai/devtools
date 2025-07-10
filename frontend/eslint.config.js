import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginReactConfig from 'eslint-plugin-react/configs/recommended.js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // 全局配置 & 推荐规则
  {
    ignores: ['dist', 'eslint.config.js'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  ...tseslint.configs.recommended, // typescript-eslint 的推荐规则

  // React 相关配置
  {
    ...pluginReactConfig,
    settings: {
      react: {
        version: 'detect', // 自动检测 React 版本
      },
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
