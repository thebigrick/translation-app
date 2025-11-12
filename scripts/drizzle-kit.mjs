#!/usr/bin/env node

// Set NODE_OPTIONS before importing/executing drizzle-kit
process.env.NODE_OPTIONS = '-r ts-node/register/transpile-only';

// Get the command and arguments
const command = process.argv[2];
const args = process.argv.slice(3);

// Use execa to run drizzle-kit
import('execa').then(({ execa }) => {
  return execa('drizzle-kit', [command, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
}).then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Error:', error.message);
  process.exit(error.exitCode || 1);
});

