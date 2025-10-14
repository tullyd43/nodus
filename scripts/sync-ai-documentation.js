const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '.gemini-sync.json';

function syncAiDocs() {
    try {
        console.log('Starting AI documentation synchronization...');

        const projectRoot = process.cwd();
        const configPath = path.join(projectRoot, CONFIG_FILE);

        if (!fs.existsSync(configPath)) {
            console.warn(`Warning: Configuration file not found at ${configPath}. Skipping sync.`);
            return;
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const { include, output_file } = config;

        if (!include || !output_file) {
            throw new Error('Invalid configuration: `include` and `output_file` must be defined.');
        }

        let combinedContent = `# AI Project Context

This file is auto-generated to provide context to AI assistants. Do not edit it manually, as your changes will be overwritten.

Last updated: ${new Date().toISOString()}

---

`;

        for (const pattern of include) {
            const filePath = path.join(projectRoot, pattern);
            if (fs.existsSync(filePath)) {
                console.log(`Including content from: ${pattern}`);
                const content = fs.readFileSync(filePath, 'utf8');
                combinedContent += `
--- START OF FILE: ${pattern} ---

`;
                combinedContent += content;
                combinedContent += `

--- END OF FILE: ${pattern} ---

`;
            } else {
                console.warn(`Warning: File not found, skipping: ${pattern}`);
            }
        }

        const outputPath = path.join(projectRoot, output_file);
        fs.writeFileSync(outputPath, combinedContent);

        console.log(`Successfully synchronized AI documentation to ${output_file}.`);

    } catch (error) {
        console.error('Error during AI documentation synchronization:', error);
        process.exit(1);
    }
}

syncAiDocs();