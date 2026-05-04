import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const server = new McpServer({
    name: 'dependency-game',
    version: '0.1.0',
});
server.tool('run_simulation', 'Run the Dependency Game Monte Carlo simulation and return strategy comparison results', {}, async () => {
    const output = await new Promise((resolve, reject) => {
        const proc = spawn('node', ['simulate.js'], {
            cwd: projectRoot,
            env: process.env,
        });
        const chunks = [];
        const errChunks = [];
        proc.stdout.on('data', (chunk) => chunks.push(chunk));
        proc.stderr.on('data', (chunk) => errChunks.push(chunk));
        proc.on('close', (code) => {
            if (code !== 0) {
                const err = Buffer.concat(errChunks).toString();
                reject(new Error(`simulate.js exited with code ${code}: ${err}`));
            }
            else {
                resolve(Buffer.concat(chunks).toString());
            }
        });
        proc.on('error', reject);
    });
    return {
        content: [{ type: 'text', text: output }],
    };
});
const transport = new StdioServerTransport();
await server.connect(transport);
