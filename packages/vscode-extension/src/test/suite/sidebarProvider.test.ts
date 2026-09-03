/**
 * Remember Me - sidebar project integrity tests
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JsonStorage } from '../../memory/storage';
import { ProjectManager } from '../../memory/project';
import { loadSidebarProjects } from '../../ui/sidebarProvider';

describe('RememberMeSidebarProvider project loading', () => {
  let tempDir: string;
  let storage: JsonStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-sidebar-test-'));
    storage = new JsonStorage({ basePath: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('应忽略缺少 context.json 的残留目录', () => {
    new ProjectManager(storage).create('TeamFlow', '团队', '协作');
    storage.write([], 'projects', 'stale-project', 'conversations', '.gitkeep');

    const projects = loadSidebarProjects(storage);

    assert.strictEqual(projects.length, 1);
    assert.strictEqual(projects[0].context.name, 'TeamFlow');
  });

  it('应忽略缺少有效项目名的损坏上下文', () => {
    storage.write({ id: 'broken', name: '' }, 'projects', 'broken', 'context.json');

    assert.deepStrictEqual(loadSidebarProjects(storage), []);
  });

  it('应保留真实项目名而不是目录 slug', () => {
    new ProjectManager(storage).create('Team / Alpha', '团队', '协作');

    const projects = loadSidebarProjects(storage);

    assert.strictEqual(projects[0].directoryName, 'team-alpha');
    assert.strictEqual(projects[0].context.name, 'Team / Alpha');
  });
});
