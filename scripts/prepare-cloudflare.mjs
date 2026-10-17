import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, join } from 'node:path';
import config from '../cloudflare.config.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),output=resolve(root,'.cloudflare/output/v0');
if(relative(root,output)!==join('.cloudflare','output','v0'))throw new Error('Unexpected Cloudflare output directory');
await rm(output,{recursive:true,force:true});
const worker=resolve(output,'workers/default');
await mkdir(resolve(worker,'assets/protoform.ing'),{recursive:true});
await cp(resolve(root,'dist'),resolve(worker,'assets/protoform.ing'),{recursive:true,filter:source=>!source.endsWith('_headers')});
// The SPA fallback serves the asset-root index for /protoform.ing/<seed> requests.
await cp(resolve(root,'dist/index.html'),resolve(worker,'assets/index.html'));
// Cloudflare applies _headers from the asset root, not from a routed subdirectory.
await cp(resolve(root,'_headers'),resolve(worker,'assets/_headers'));
await writeFile(resolve(output,'config.json'),JSON.stringify({accountId:config.accountId,buildContext:{isPreview:false}},null,2));
await writeFile(resolve(worker,'worker.config.json'),JSON.stringify(config.worker,null,2));
console.log('Prepared assets-only deployment for martinhundrup.com/protoform.ing/');
