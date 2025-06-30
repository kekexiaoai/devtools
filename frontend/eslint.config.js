import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import * as vueParser from 'vue-eslint-parser';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    // 1. 忽略文件
    { ignores: ['node_modules', 'dist', 'wailsjs/', 'src/vite-env.d.ts'], },

    // 2. JS/TS 文件的基础配置 (来自 @typescript-eslint/eslint-plugin)
    // 这部分通常是稳定的
    ...tseslint.configs.recommended,

    // 3. Vue 文件的核心解析配置 (!! 核心简化部分 !!)
    {
        files: ['**/*.vue'],
        // **重要**：我们只定义如何解析，暂时不添加任何来自 pluginVue 的 rules
        plugins: {
            vue: pluginVue,
        },
        languageOptions: {
            globals: { ...globals.browser },
            parser: vueParser,
            parserOptions: {
                parser: tseslint.parser,
                sourceType: 'module',
            },
        },
    },

    // 4. Prettier 配置，以禁用格式规则
    eslintConfigPrettier,
];