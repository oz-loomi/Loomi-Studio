import fs from 'fs';
import path from 'path';

export type EspVariableDefinition = {
  variable: string;
  label: string;
  description: string;
};

export type EspVariableCatalog = Record<string, EspVariableDefinition[]>;

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const ESP_VARIABLES_FILE = path.join(DATA_DIR, 'esp-variables.json');

function parseCatalog(filePath: string): EspVariableCatalog | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as EspVariableCatalog;
  } catch {
    return null;
  }
}

/**
 * Reads provider-agnostic variable definitions.
 */
export function readEspVariables(): EspVariableCatalog {
  return parseCatalog(ESP_VARIABLES_FILE) || {};
}
