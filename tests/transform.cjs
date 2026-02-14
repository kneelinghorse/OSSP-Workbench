/**
 * Custom Jest Transformer
 *
 * Pre-processes import.meta.url patterns before passing to babel-jest.
 * This eliminates the need for --experimental-vm-modules and avoids
 * Jest's "module is already linked" bug.
 *
 * Transforms:
 *   1. Removes `const __filename = fileURLToPath(import.meta.url)` — CJS already provides __filename
 *   2. Removes `const __dirname = ...dirname(__filename)` — CJS already provides __dirname
 *   3. Replaces remaining `import.meta.url` with `'file://' + __filename`
 */
const babelJest = require('babel-jest');

const transformer = babelJest.createTransformer();

module.exports = {
  process(sourceText, sourcePath, options) {
    let src = sourceText;

    // Remove: const __filename = fileURLToPath(import.meta.url);
    src = src.replace(
      /const\s+__filename\s*=\s*fileURLToPath\(import\.meta\.url\)\s*;?/g,
      '/* __filename: provided by CJS */'
    );

    // Remove: const __dirname = path.dirname(__filename); (or dirname(__filename))
    src = src.replace(
      /const\s+__dirname\s*=\s*(?:path\.)?dirname\(__filename\)\s*;?/g,
      '/* __dirname: provided by CJS */'
    );

    // Remove: const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
    src = src.replace(
      /const\s+__dirnameLocal\s*=\s*(?:path\.)?dirname\(fileURLToPath\(import\.meta\.url\)\)\s*;?/g,
      'const __dirnameLocal = __dirname;'
    );

    // Replace remaining import.meta.url with CJS equivalent
    src = src.replace(
      /import\.meta\.url/g,
      "('file://' + __filename)"
    );

    return transformer.process(src, sourcePath, options);
  },

  getCacheKey(sourceText, sourcePath, options) {
    return transformer.getCacheKey(sourceText, sourcePath, options);
  }
};
