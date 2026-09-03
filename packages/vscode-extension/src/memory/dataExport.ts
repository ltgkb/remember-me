/** Portable, allowlisted export of user-owned Remember Me data. */

import type { JsonStorage } from './storage';

interface ExportedFile<T = unknown> {
  filename: string;
  data: T;
}

export interface ExportedProject {
  directoryName: string;
  context: unknown | null;
  conversations: ExportedFile[];
}

export interface MemoryDataExport {
  format: 'remember-me-data-export';
  schemaVersion: 1;
  extensionVersion: string;
  exportedAt: string;
  data: {
    profile: unknown | null;
    activeProject: unknown | null;
    searchSettings: unknown | null;
    projects: ExportedProject[];
    userTemplates: ExportedFile[];
  };
  skippedPaths: string[];
}

export function createMemoryDataExport(
  storage: JsonStorage,
  extensionVersion: string,
  exportedAt: string = new Date().toISOString()
): MemoryDataExport {
  const skippedPaths: string[] = [];
  const safeRead = (segments: string[]): unknown | null => {
    try {
      const value = storage.read<unknown>(...segments);
      if (value === null && storage.exists(...segments)) {
        skippedPaths.push(segments.join('/'));
      }
      return value;
    } catch {
      skippedPaths.push(segments.join('/'));
      return null;
    }
  };
  const listJsonFiles = (segments: string[]): ExportedFile[] => {
    let filenames: string[] = [];
    try {
      filenames = storage.listDir(...segments)
        .filter((filename) => filename.endsWith('.json'))
        .sort();
    } catch {
      skippedPaths.push(segments.join('/'));
      return [];
    }
    return filenames.flatMap((filename) => {
      const data = safeRead([...segments, filename]);
      return data === null ? [] : [{ filename, data }];
    });
  };

  const projects: ExportedProject[] = [];
  let projectDirectories: string[] = [];
  try {
    projectDirectories = storage.listDir('projects').sort();
  } catch {
    skippedPaths.push('projects');
  }
  for (const directoryName of projectDirectories) {
    projects.push({
      directoryName,
      context: safeRead(['projects', directoryName, 'context.json']),
      conversations: listJsonFiles(['projects', directoryName, 'conversations']),
    });
  }

  return {
    format: 'remember-me-data-export',
    schemaVersion: 1,
    extensionVersion,
    exportedAt,
    data: {
      profile: safeRead(['profile.json']),
      activeProject: safeRead(['current-project.json']),
      searchSettings: safeRead(['search-settings.json']),
      projects,
      userTemplates: listJsonFiles(['user-templates']),
    },
    skippedPaths: [...new Set(skippedPaths)].sort(),
  };
}
