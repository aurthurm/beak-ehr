import { readFileSync } from 'fs';
import path from 'path';

const rootPackage = JSON.parse(readFileSync('./package.json', 'utf8'));

function readWorkspaceManifests() {
  const manifests = new Map();

  for (const workspacePath of rootPackage.workspaces.packages) {
    const pkgPath = path.join(workspacePath, 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (!pkg?.name) {
        console.error(`Skipping ${workspacePath} as it has no package name...`);
        continue;
      }

      manifests.set(pkg.name, {
        pkg,
        pkgPath: `./${pkgPath}`,
        workspacePath,
      });
    } catch (err) {
      console.error(`Skipping ${workspacePath} as we can't read its package.json...`);
    }
  }

  return manifests;
}

function extractDependencyTree(manifests) {
  const dependencyTree = {};

  for (const [name, { pkg }] of manifests.entries()) {
    const workspaceDeps = new Set();
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const dependency of Object.keys(pkg[section] ?? {})) {
        if (manifests.has(dependency)) {
          workspaceDeps.add(dependency);
        }
      }
    }

    dependencyTree[name] = [...workspaceDeps];
  }

  return dependencyTree;
}

export function doWithAllPackages(fn) {
  const manifests = readWorkspaceManifests();
  const workspaces = new Set(manifests.keys());
  const processed = new Set();

  const dependencyTree = extractDependencyTree(manifests);
  const packagesThatAreDependedOn = new Set(Object.values(dependencyTree).flat());

  // find and build dependencies for each workspace
  // max number of iterations is pow(workspaces.size, 2)
  for (let i = 0; i <= workspaces.size; i++) {
    if (processed.size === workspaces.size) break;
    for (const workspace of workspaces) {
      if (processed.has(workspace)) continue;

      const { pkg, pkgPath } = manifests.get(workspace);
      const workspaceDependencies = dependencyTree[workspace];

      if (workspaceDependencies.every(dep => processed.has(dep))) {
        processed.add(workspace);

        fn(workspace, pkg, pkgPath, packagesThatAreDependedOn.has(workspace));
      }
    }
  }
}
