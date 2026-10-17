import { mkdir, cp, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),dest=resolve(root,'dist');
if(relative(root,dest)!=='dist')throw new Error('Unexpected build destination');
await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
for(const name of ['index.html','styles.css','app.js','controls.js','simulation.js','worker.js','renderer.js','favicon.svg','RESEARCH.md','_headers'])await cp(resolve(root,name),resolve(dest,name));
console.log(`Built ${(await readdir(dest)).length} static files in dist/. No runtime dependencies.`);
