import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=process.cwd(), dirs=['assets/images/pratos','assets/images/combos','assets/images/marca'];
const sources=['index.html','js/data/pratos.js','js/data/combos.js','sw.js'], minPsnr=40, qualities=[86,90,92,94,96], report=[], refs=new Map();
for(const f of sources){const c=await fs.readFile(path.join(root,f),'utf8');for(const m of c.matchAll(/assets\/images\/(?:pratos|combos|marca)\/[^"'()]+/g))refs.set(m[0],(refs.get(m[0])||0)+1);}
function psnr(a,b){if(a.length!==b.length||!a.length)return 0;let e=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];e+=d*d;}e/=a.length;return e===0?99:10*Math.log10(65025/e);}
const fmt=n=>(n/1024).toFixed(1)+' KB';
for(const dir of dirs){const entries=await fs.readdir(path.join(root,dir),{withFileTypes:true});for(const ent of entries.filter(e=>e.isFile())){const rel=path.posix.join(dir,ent.name),ext=path.extname(rel).toLowerCase();if(!['.png','.jpg','.jpeg','.webp'].includes(ext))continue;const bytes=(await fs.stat(path.join(root,rel))).size,used=refs.has(rel);try{
const input=path.join(root,rel),meta=await sharp(input,{failOn:'error'}).metadata();if(!meta.width||!meta.height||bytes<100)throw new Error('arquivo vazio ou sem dimensões válidas');
const base=await sharp(input).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer();let chosen=null;
for(const quality of qualities){const buffer=await sharp(input).rotate().webp({quality,alphaQuality:100,effort:6,smartSubsample:true}).toBuffer();const decoded=await sharp(buffer).toColourspace('srgb').ensureAlpha().raw().toBuffer();const score=psnr(base,decoded);if(score>=minPsnr){chosen={buffer,quality,score};break;}}
if(!chosen)throw new Error('não atingiu PSNR mínimo de 40 dB');
const out='assets/images/optimized/'+path.basename(dir)+'/'+path.basename(rel,ext)+'.webp',dest=path.join(root,out);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,chosen.buffer);const saved=bytes-chosen.buffer.length,replace=used&&saved>0;
if(replace){for(const f of sources){const p=path.join(root,f),c=await fs.readFile(p,'utf8');if(c.includes(rel)){const n=c.split(rel).join(out);await fs.writeFile(p,n);}}}
report.push({source:rel,optimized:out,used,references:refs.get(rel)||0,width:meta.width,height:meta.height,originalBytes:bytes,webpBytes:chosen.buffer.length,savedBytes:saved,savedPercent:Number((saved/bytes*100).toFixed(1)),quality:chosen.quality,psnrDb:Number(chosen.score.toFixed(2)),replaced:replace?'sim':'não'});
}catch(e){report.push({source:rel,used,references:refs.get(rel)||0,originalBytes:bytes,skipped:e.message});}}}
const used=report.filter(x=>x.used&&x.webpBytes&&x.replaced==='sim');
if(used.length){const p=path.join(root,'sw.js');const c=await fs.readFile(p,'utf8');await fs.writeFile(p,c.replace('tempero-v4-modular','tempero-v5-webp'));}
const sum=k=>k.reduce((n,x)=>n+x.originalBytes,0),sumW=k=>k.reduce((n,x)=>n+x.webpBytes,0),orig=sum(used),webp=sumW(used),saved=orig-webp,pct=orig?saved/orig*100:0;
const lines=['# Relatório de otimização de fotografias','','Gerado automaticamente em '+new Date().toISOString()+'.','','## Resultado geral','', '- Fotografias utilizadas e convertidas: **'+used.length+'**','- Peso original total: **'+fmt(orig)+'**','- Peso WebP total: **'+fmt(webp)+'**','- Economia: **'+fmt(saved)+' ('+pct.toFixed(1)+'%)**','- Qualidade mínima verificada: **PSNR ≥ '+minPsnr+' dB**','- Dimensões preservadas (sem redução de resolução); originais mantidos.','','## Inventário por arquivo','','| Arquivo original | Uso no site | Dimensões | Original | WebP | Economia | PSNR | Referência atualizada |','|---|---:|---:|---:|---:|---:|---:|---:|'];
for(const x of report){if(x.webpBytes)lines.push('| '+x.source+' | '+(x.used?'Sim':'Não')+' | '+x.width+'×'+x.height+' | '+fmt(x.originalBytes)+' | '+fmt(x.webpBytes)+' | '+x.savedPercent+'% | '+x.psnrDb+' dB | '+x.replaced+' |');else lines.push('| '+x.source+' | '+(x.used?'Sim':'Não')+' | — | '+fmt(x.originalBytes)+' | — | — | — | Ignorada: '+x.skipped+' |');}
lines.push('','## Observações','','- Os arquivos originais não são apagados nem sobrescritos.','- Imagens sem economia permanecem referenciadas no formato original.','- Ícones PWA permanecem PNG para compatibilidade com o manifesto.','- PSNR compara os pixels decodificados; não substitui inspeção visual humana.','');
await fs.mkdir(path.join(root,'docs'),{recursive:true});await fs.writeFile(path.join(root,'docs/otimizacao-imagens.md'),lines.join('\n'));await fs.writeFile(path.join(root,'docs/otimizacao-imagens.json'),JSON.stringify({minPsnr,totals:{convertedUsed:used.length,originalBytes:orig,webpBytes:webp,savedBytes:saved,savedPercent:Number(pct.toFixed(1))},files:report},null,2));
if(!used.length)throw new Error('Nenhuma imagem utilizada foi convertida com economia; não publicar.');
for(const f of sources){const c=await fs.readFile(path.join(root,f),'utf8');for(const m of c.matchAll(/assets\/images\/optimized\/[^"'()]+/g)){try{await fs.access(path.join(root,m[0]));}catch{throw new Error('Referência WebP quebrada em '+f+': '+m[0]);}}}
console.log(JSON.stringify({convertedUsed:used.length,originalBytes:orig,webpBytes:webp,savedBytes:saved,savedPercent:Number(pct.toFixed(1)),files:report},null,2));
