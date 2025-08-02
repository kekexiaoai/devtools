import path from 'path';

/**
 * Custom filter function to format JSON/MD files while excluding specific ones.
 * @param {string[]} absolutePaths - An array of absolute file paths from lint-staged.
 * @returns {string[]} The prettier command for the filtered files.
 */
const formatJsonAndMdExcluding = (absolutePaths) => {
  // A list of RELATIVE paths to exclude from formatting.
  const excludedRelativePaths = [
    'wailsjs/runtime/package.json',
    // Add any other files you wish to exclude here.
  ];

  const filesToFormat = absolutePaths.filter(
    (absolutePath) =>
      // Check if the absolute path ENDS WITH any of the relative paths to exclude.
      // path.normalize ensures cross-platform compatibility (Windows/macOS/Linux).
      !excludedRelativePaths.some((relativePath) =>
        absolutePath.endsWith(path.normalize(relativePath))
      )
  );

  if (filesToFormat.length === 0) {
    return [];
  }

  // Pass the filtered list of absolute paths to Prettier.
  return [`prettier --write ${filesToFormat.join(' ')}`];
};

// Use "export default" for modern ESM configuration.
export default {
  // Adjust `src` to your actual source code folder(s) if different, e.g., '{src,lib,scripts}/**/*.{js,ts,jsx,tsx}'
  'src/**/*.{js,ts,jsx,tsx}': ['prettier --write', 'eslint --fix'],

  // This glob is correct, and its behavior is now fixed by the updated function above.
  '**/*.{json,md}': formatJsonAndMdExcluding,
};