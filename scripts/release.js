#!/usr/bin/env node

/**
 * Release automation script
 * Handles version incrementing, tag creation, monitors GitHub Actions, and updates release notes
 * 
 * Usage:
 *   npm run release patch "Bug fixes and performance improvements"
 *   npm run release minor "New features and enhancements"
 *   npm run release major "Breaking changes"
 *   npm run release patch --file RELEASE_NOTES.md
 *   
 *   # Or specify exact version
 *   npm run release v0.1.1 "Initial release"
 *   npm run release 0.2.0 --file ./docs/release-notes.md
 * 
 * Examples:
 *   npm run release patch "Fixed Windows compatibility and ESLint errors"
 *   npm run release minor "Added clustering algorithms and validation metrics"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/release.js patch|minor|major <description>');
  console.error('       node scripts/release.js patch|minor|major --file <path>');
  console.error('       node scripts/release.js <version> <description>');
  console.error('       node scripts/release.js <version> --file <path>');
  process.exit(1);
}

const versionArg = args[0];
const isFile = args[1] === '--file';
const descriptionOrPath = isFile ? args[2] : args.slice(1).join(' ');

// Determine if we need to increment version or use specific version
let version;
let tagName;

if (['patch', 'minor', 'major'].includes(versionArg)) {
  // Increment version using npm
  console.log(`📦 Incrementing ${versionArg} version...`);
  const output = execSync(`npm version ${versionArg} --no-git-tag-version`, { encoding: 'utf8' });
  version = output.trim().replace(/^v/, '');
  tagName = `v${version}`;
  console.log(`   New version: ${version}`);
} else {
  // Use specific version
  if (!versionArg.match(/^v?\d+\.\d+\.\d+/)) {
    console.error('Error: Invalid version format. Use v0.1.0 or 0.1.0');
    process.exit(1);
  }
  version = versionArg.replace(/^v/, '');
  tagName = `v${version}`;
  
  // Update package.json with the new version
  console.log(`📦 Setting version to ${version}...`);
  execSync(`npm version ${version} --no-git-tag-version`, { encoding: 'utf8' });
}

// Get release description
let releaseNotes = '';
if (isFile) {
  if (!descriptionOrPath) {
    console.error('Error: No file path provided after --file');
    process.exit(1);
  }
  try {
    releaseNotes = fs.readFileSync(descriptionOrPath, 'utf8');
  } catch (err) {
    console.error(`Error reading file ${descriptionOrPath}:`, err.message);
    process.exit(1);
  }
} else {
  releaseNotes = descriptionOrPath;
}

// Helper function to run commands
function run(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (err) {
    if (!options.ignoreError) {
      console.error(`Command failed: ${command}`);
      console.error(err.message);
      process.exit(1);
    }
    return null;
  }
}

// Helper function to check if we have GitHub CLI
function checkGitHubCLI() {
  try {
    run('gh --version', { ignoreError: true });
    return true;
  } catch {
    return false;
  }
}

// Main release process
async function release() {
  console.log(`🚀 Starting release process for ${tagName}...`);

  // Check prerequisites
  if (!checkGitHubCLI()) {
    console.error('Error: GitHub CLI (gh) is required but not installed.');
    console.error('Install it from: https://cli.github.com/');
    process.exit(1);
  }

  // Ensure we're on main branch
  const currentBranch = run('git branch --show-current').trim();
  if (currentBranch !== 'main') {
    console.error(`Error: Must be on main branch. Currently on: ${currentBranch}`);
    process.exit(1);
  }

  // Ensure working directory is clean
  const gitStatus = run('git status --porcelain').trim();
  if (gitStatus) {
    console.error('Error: Working directory has uncommitted changes.');
    console.error('Please commit or stash your changes first.');
    process.exit(1);
  }

  // Pull latest changes
  console.log('📥 Pulling latest changes...');
  run('git pull origin main');

  // Check if tag already exists
  const existingTag = run(`git tag -l ${tagName}`, { ignoreError: true });
  if (existingTag && existingTag.trim() === tagName) {
    console.error(`Error: Tag ${tagName} already exists`);
    process.exit(1);
  }

  // Create release branch
  const branchName = `release/${tagName}`;
  console.log(`🌿 Creating release branch ${branchName}...`);
  run(`git checkout -b ${branchName}`);

  // Commit the version change
  console.log('💾 Committing version change...');
  run('git add package.json package-lock.json');
  run(`git commit -m "chore: release ${version}"`);

  // Push the branch
  console.log('📤 Pushing release branch...');
  run(`git push -u origin ${branchName}`);

  // Create PR with release label
  console.log('🔀 Creating pull request...');
  
  // Write release notes to a temporary file for PR body
  const tempFile = path.join(require('os').tmpdir(), `release-notes-${Date.now()}.md`);
  const prBody = `## Release ${tagName}

${releaseNotes}

---
This PR was created automatically by the release script. Once merged, it will trigger:
- NPM package publication
- GitHub release creation
- Git tag creation`;
  
  fs.writeFileSync(tempFile, prBody);
  
  try {
    // Create PR with the release label
    const prUrl = run(
      `gh pr create --title "chore: release ${version}" --body-file "${tempFile}" --label "release" --base main`
    ).trim();
    
    console.log(`✨ Pull request created: ${prUrl}`);
    console.log('\n📋 Next steps:');
    console.log('   1. Review the PR');
    console.log('   2. Merge when ready');
    console.log('   3. The release workflow will automatically:');
    console.log('      - Create git tag');
    console.log('      - Publish to npm');
    console.log('      - Create GitHub release');
    
    // Open PR in browser
    console.log('\n🌐 Opening PR in browser...');
    try {
      run(`gh pr view --web`);
    } catch (err) {
      // Ignore if browser fails to open
    }
  } catch (err) {
    console.error('Failed to create PR:', err.message);
    console.error('You may need to create the PR manually');
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (err) {
      // Ignore cleanup errors
    }
  }

  console.log('\n🎉 Release preparation complete!');
  console.log(`   Version: ${tagName}`);
  console.log(`   Branch: ${branchName}`);
}

// Run the release
release().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});