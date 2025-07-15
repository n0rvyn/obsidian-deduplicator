#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Paths
const packageJsonPath = path.join(__dirname, '../package.json');
const manifestTemplatePath = path.join(__dirname, '../manifest.json.template');
const manifestJsonPath = path.join(__dirname, '../manifest.json');
const distDir = path.join(__dirname, '../dist');
const distManifestPath = path.join(distDir, 'manifest.json');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read package.json and manifest template
let packageJson, manifestTemplate;

try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  manifestTemplate = JSON.parse(fs.readFileSync(manifestTemplatePath, 'utf8'));
} catch (error) {
  console.error('Error reading package.json or manifest.json.template:', error);
  process.exit(1);
}

// Clean manifest for production - remove development-only fields
const cleanManifest = {
  id: manifestTemplate.id,
  name: manifestTemplate.name,
  version: packageJson.version,
  minAppVersion: manifestTemplate.minAppVersion,
  description: packageJson.description || manifestTemplate.description,
  author: manifestTemplate.author,
  authorUrl: manifestTemplate.authorUrl,
  fundingUrl: manifestTemplate.fundingUrl,
  isDesktopOnly: manifestTemplate.isDesktopOnly,
  main: manifestTemplate.main
};

// Remove undefined fields
Object.keys(cleanManifest).forEach(key => {
  if (cleanManifest[key] === undefined || cleanManifest[key] === "") {
    delete cleanManifest[key];
  }
});

// Write clean manifest to dist directory
try {
  fs.writeFileSync(distManifestPath, JSON.stringify(cleanManifest, null, 2));
  console.log(`✅ Production manifest created: ${cleanManifest.version} → ${distManifestPath}`);

  // Also create a manifest.json in the root for compatibility
  fs.writeFileSync(manifestJsonPath, JSON.stringify(cleanManifest, null, 2));
  console.log(`✅ Root manifest created: ${manifestJsonPath}`);
} catch (error) {
  console.error('Error writing production manifest:', error);
  process.exit(1);
}

// Log summary
console.log(`📦 Package: ${packageJson.name}@${packageJson.version}`);
console.log(`🚀 Production build completed`);
console.log(`📄 Clean manifest size: ${JSON.stringify(cleanManifest, null, 2).length} bytes`);