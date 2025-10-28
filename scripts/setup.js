#!/usr/bin/env node

/**
 * Setup script to fix npm issues and prepare the project
 */

import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

const projectRoot = process.cwd();

console.log('🔧 Setting up Nodus V7.1 project...\n');

// Step 1: Clean existing installations
console.log('1️⃣ Cleaning existing installation...');
const pathsToClean = [
  'node_modules',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.npm',
  'dist',
  '.vite'
];

pathsToClean.forEach(path => {
  const fullPath = join(projectRoot, path);
  if (existsSync(fullPath)) {
    console.log(`   Removing ${path}...`);
    rmSync(fullPath, { recursive: true, force: true });
  }
});

// Step 2: Install dependencies
console.log('\n2️⃣ Installing dependencies...');
try {
  execSync('npm install', { 
    stdio: 'inherit',
    cwd: projectRoot 
  });
  console.log('✅ Dependencies installed successfully');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Step 3: Run audit fix
console.log('\n3️⃣ Fixing security vulnerabilities...');
try {
  execSync('npm audit fix', { 
    stdio: 'inherit',
    cwd: projectRoot 
  });
  console.log('✅ Security issues resolved');
} catch (error) {
  console.warn('⚠️ Some security issues may require manual attention');
}

// Step 4: Initialize git hooks if git exists
console.log('\n4️⃣ Setting up git hooks...');
try {
  if (existsSync(join(projectRoot, '.git'))) {
    execSync('npx husky install', { 
      stdio: 'inherit',
      cwd: projectRoot 
    });
    console.log('✅ Git hooks initialized');
  } else {
    console.log('ℹ️ Git repository not found, skipping hooks setup');
  }
} catch (error) {
  console.warn('⚠️ Git hooks setup failed:', error.message);
}

// Step 5: Validate setup
console.log('\n5️⃣ Validating setup...');
try {
  execSync('npm run lint --silent', { 
    stdio: 'inherit',
    cwd: projectRoot 
  });
  console.log('✅ Linting configuration working');
} catch (error) {
  console.warn('⚠️ Linting issues found - run `npm run lint:fix` to auto-fix');
}

try {
  execSync('npm run format:check --silent', { 
    stdio: 'pipe',
    cwd: projectRoot 
  });
  console.log('✅ Code formatting is correct');
} catch (error) {
  console.warn('⚠️ Code formatting issues found - run `npm run format` to fix');
}

// Final summary
console.log('\n🎉 Setup complete! You can now:');
console.log('   npm run dev     - Start development server');
console.log('   npm run test    - Run tests');
console.log('   npm run build   - Build for production');
console.log('   npm run lint    - Check code quality');
console.log('   npm run format  - Format code');
console.log('\n✨ Happy coding with Nodus V7.1!');
