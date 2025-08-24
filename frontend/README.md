# DevTools Frontend Configuration Guide

This document aims to explain in detail the purpose of each core configuration file in this project's `frontend` directory, as well as the meaning of their key configuration items.

## 1. `package.json` - The Project's Identity

This is the core of any Node.js project, defining its metadata, dependencies, and executable scripts.

- **`"type": "module"`**: A key setting. It tells Node.js that this project uses the modern **ES Module (ESM)** specification by default, i.e., using `import/export` syntax.
- **`"scripts"`**: Defines the commands we can run via `pnpm <script_name>`.
  - `"dev"`: Starts the Vite development server for live preview and hot updates.
  - `"build"`: Uses the TypeScript compiler (`tsc`) to check types, then uses Vite to bundle and generate static frontend files for production.
  - `"lint"`: Uses ESLint to check the code quality and style issues of the entire project.
  - `"format"`: Uses Prettier to automatically format all code in the project.
- **`"dependencies"`**: Defines the packages necessary for the application to run in a production environment, such as `react` and `react-dom`.
- **`"devDependencies"`**: Defines the tools and libraries used only during the development process, such as `vite`, `typescript`, `tailwindcss`, etc.

## 2. `vite.config.ts` - The Frontend Build Engine

This is Vite's configuration file, which controls how our frontend code is compiled, bundled, and served.

```typescript
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- **`plugins: [react()]`**: Tells Vite that we are using React. This plugin automatically handles JSX syntax transformation and React's Hot Module Replacement (Fast Refresh) feature.
- **`resolve.alias`**: This is the path alias configuration. We define an alias `@" that points to the `src`directory. This allows us to use clear paths like`import X from '@/components/...'`in our code, instead of tedious and error-prone relative paths like`../../components/...`.

## 3. PostCSS & Tailwind CSS v4 Configuration

In Tailwind v4, it primarily works as a PostCSS plugin.

### 3.1. `postcss.config.mjs`

This is the PostCSS configuration file, the engine room that drives Tailwind.

```javascript
const config = {
  plugins: {
    '@tailwindcss/postcss': {}, // Use the new @tailwindcss/postcss package
  },
}
export default config
```

- This file tells Vite that when processing CSS, it needs to be handled by the `@tailwindcss/postcss` plugin.

## 4. `src/style.css` - Global Style Entry Point

This is the starting point for all styles in the entire application.

```css
/* 1. Import all parts of Tailwind CSS */
@import 'tailwindcss';

/* 2. Use @layer to define our own global optimized styles */
@layer base {
  body {
    @apply bg-background text-foreground font-sans select-none;
  }
  /* ... Other native-feel optimizations, like scrollbars, text selection styles, etc. ... */
}
```

- **`@import "tailwindcss";`**: This is the new syntax for Tailwind v4, which injects Preflight (base style reset) and all utility classes at once.
- **`@layer base { ... }`**: We define our own global base styles here. `@layer` is a standard CSS feature, and Tailwind intelligently places these styles in the correct position to ensure they can be overridden by utility classes.

## 5. TypeScript Configuration (`tsconfig.json` & `tsconfig.node.json`)

- **`tsconfig.json`**:
  - **`"jsx": "react-jsx"`**: Tells TypeScript how to handle JSX syntax.
  - **`"moduleResolution": "bundler"`**: The module resolution strategy recommended by Vite 5+, which better handles mixed CommonJS and ESM modules in modern frontend toolchains.
  - **`"paths": { "@/*": ["./src/*"] }`**: Defines path aliases matching those in `vite.config.ts`, allowing both TypeScript and the editor to recognize `@/`.
- **`tsconfig.node.json`**:
  - This is an auxiliary configuration file specifically for allowing TypeScript to correctly compile Node.js environment configuration files, such as `vite.config.ts`.

## 6. ESLint & Prettier Configuration

- **`.eslintrc.cjs`**: Inherits a series of community-recommended best practice rule sets via `extends`, helping us automatically check for code quality and potential errors.
- **`.prettierrc.json`**: Only defines the code's appearance style, such as using single quotes, no semicolons, etc., to ensure a consistent team style.
- **`eslint-config-prettier`**: In the `extends` array of `.eslintrc.cjs`, `'prettier'` must be placed last. It disables all ESLint rules that conflict with Prettier's formatting functions, preventing the two tools from "fighting".

### How to automatically Lint and Prettier on commit?

- make hooks
