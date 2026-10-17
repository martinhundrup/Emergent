import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL(process.argv.includes('--dist')?'../dist/':'../',import.meta.url));
const portIndex=process.argv.indexOf('--port'),port=portIndex>=0?Number(process.argv[portIndex+1]):3002;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/emergent'){res.writeHead(302,{Location:'/emergent/'});res.end();return;}
    if(/^\/(?:emergent\/)?\d+\/$/.test(path)){res.writeHead(308,{Location:path.slice(0,-1)});res.end();return;}
    if(/^\/(?:emergent\/)?\d+$/.test(path))path='/index.html';
    if(path.startsWith('/emergent/'))path=path.slice('/emergent'.length);
    if(path.endsWith('/'))path+='index.html';
    const file=resolve(root,'.'+path),rel=relative(root,file);
    if(isAbsolute(rel)||rel.startsWith('..')||rel.split(/[\\/]/).some(p=>p.startsWith('.'))){res.writeHead(403);res.end('Forbidden');return;}
    if(!(await stat(file)).isFile())throw new Error('Not found');
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`protoform.ing: http://127.0.0.1:${port}`));
