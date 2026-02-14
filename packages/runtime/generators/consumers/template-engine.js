/**
 * Shared template loading and rendering for consumer generators.
 */

import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_DIR = path.resolve(moduleDir, '../../../../templates/consumers');
const TEMPLATE_DIR_ENV = 'OSSP_CONSUMER_TEMPLATE_DIR';

function resolveTemplatePath(templateName, options = {}) {
  if (options.templateOverrides?.[templateName]) {
    return path.resolve(options.templateOverrides[templateName]);
  }

  const templateDir = options.templateDir || process.env[TEMPLATE_DIR_ENV] || DEFAULT_TEMPLATE_DIR;
  return path.resolve(templateDir, `${templateName}.hbs`);
}

function renderConsumerTemplate(templateName, context, options = {}) {
  const templatePath = resolveTemplatePath(templateName, options);

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Consumer template not found for '${templateName}'. Checked: ${templatePath}`
    );
  }

  const source = fs.readFileSync(templatePath, 'utf8');
  const template = Handlebars.compile(source, { noEscape: true });
  return template(context);
}

export {
  DEFAULT_TEMPLATE_DIR,
  TEMPLATE_DIR_ENV,
  resolveTemplatePath,
  renderConsumerTemplate
};
