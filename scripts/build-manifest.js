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

// Create manifest from template
const manifest = {
  ...manifestTemplate,
  version: packageJson.version,
  description: packageJson.description || manifestTemplate.description
};

// Add build timestamp (useful for development)
const now = new Date();
const buildTime = now.toISOString();

// Add build info for development builds
if (process.env.NODE_ENV !== 'production') {
  manifest.buildTime = buildTime;
  manifest.buildVersion = `${packageJson.version}-dev.${now.getTime()}`;
}

// Write updated manifest to dist directory
try {
  fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2));
  console.log(`✅ Manifest updated: ${manifest.version} → ${distManifestPath}`);

  // Also create a manifest.json in the root for compatibility
  fs.writeFileSync(manifestJsonPath, JSON.stringify(manifest, null, 2));
  console.log(`✅ Root manifest created: ${manifestJsonPath}`);
} catch (error) {
  console.error('Error writing manifest:', error);
  process.exit(1);
}

// Log summary
console.log(`📦 Package: ${packageJson.name}@${packageJson.version}`);
console.log(`🔧 Build: ${process.env.NODE_ENV || 'development'}`);
console.log(`⏰ Time: ${buildTime}`);