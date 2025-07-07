# DevTools 应用开发指南

## 关于 (About)

本项目是一个使用 Wails v2 + React + TypeScript 构建的跨平台桌面开发者工具集。

核心功能包括：

- **文件同步器**: 支持多对多目录的实时文件同步，并提供详细的日志。
- **JSON 工具**: 提供 JSON 格式化、校验、压缩和语法高亮功能。

## 1. 核心 Wails 命令

### 实时开发 (Live Development)

在项目根目录下运行 `wails dev` 来启动实时开发模式。这会同时启动一个 Vite 开发服务器，为您的前端更改提供极速的热重载（Hot Reload）。

### 生产打包 (Building)

使用 `wails build` 命令来构建一个可分发的、生产模式的应用包。例如，为 Windows 打包：

```bash
wails build -platform windows/amd64
```

## 2. 前端开发环境配置步骤

本部分详细记录了如何从零开始，为本项目搭建一个完整的、现代化的前端开发环境。

### 2.1. 前提条件

- **Go**: v1.21+
- **Node.js**: v20.12.2+
- **pnpm**: v10.12.4+ (`npm install -g pnpm`)
- **Wails CLI**: v2.10.1+ (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

### 2.2. 安装前端依赖

所有操作均在 `frontend` 目录下进行。

```bash
cd frontend
pnpm install
```

_这将根据 `package.json` 和 `pnpm-lock.yaml` 文件，安装所有必需的依赖。_

### 2.3. 配置 Tailwind CSS (v4+)

本项目使用最新版的 Tailwind CSS。其配置方式与旧版不同，核心在于 `postcss.config.mjs`。

1.  **安装核心依赖**:

    ```bash
    pnpm add -D tailwindcss @tailwindcss/postcss postcss
    ```

2.  **创建 PostCSS 配置文件**:
    在 `frontend` 目录下创建 `postcss.config.mjs` 文件：

    ```javascript
    const config = {
      plugins: {
        "@tailwindcss/postcss": {},
      },
    };
    export default config;
    ```

3.  **创建全局样式入口**:
    在 `frontend/src/style.css` 中，使用最新的 `@import` 指令：

    ```css
    @import "tailwindcss";
    ```

    并确保此文件在 `frontend/src/main.tsx` 中被导入。

### 2.4. 配置代码质量与格式化工具

本项目使用 ESLint + Prettier 来保证代码质量和风格统一。

1.  **安装开发依赖**:

    ```bash
    pnpm add -D eslint prettier eslint-plugin-react-hooks eslint-plugin-react-refresh @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier
    ```

2.  **创建配置文件**:
    在 `frontend` 目录下创建 `.eslintrc.cjs` 和 `.prettierrc.json` 文件（请参考项目中已有的文件内容）。

3.  **配置 VS Code 集成**:
    推荐安装插件 `Tailwind CSS IntelliSense`, `ESLint`, `Prettier`。并在项目根目录创建 `.vscode/settings.json` 以实现保存时自动格式化。

    ```json
    {
      "editor.formatOnSave": true,
      "editor.defaultFormatter": "esbenp.prettier-vscode",
      "css.lint.unknownAtRules": "ignore"
    }
    ```

## 3. 推荐 vscode 插件

1. Tailwind CSS IntelliSense
2. ESlint
3. Prettier
4. Tailwind Fold
5. Tailwind Config Viewer
6. Tailwind Documentation
