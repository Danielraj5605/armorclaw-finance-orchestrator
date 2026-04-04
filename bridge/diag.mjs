import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const base = join(homedir(), 'openclaw-armoriq', 'dist');
const content = readFileSync(join(base, 'client-CCqL8vaL.js'), 'utf8');

// Get 3000 chars around connect.challenge
const idx = content.indexOf('connect.challenge');
console.log(content.slice(Math.max(0, idx-200), idx+3000));
