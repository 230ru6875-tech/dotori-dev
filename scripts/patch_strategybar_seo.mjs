import fs from "node:fs";
const path="strategybar-runtime/dist/index.html";
let html=fs.readFileSync(path,"utf8");
const title="미국주식으로 돈벌기 프로젝트";
const description="미국주식 시장지표, 종목 발굴, 투자 실험과 PAPER 검증을 추적하는 도토리스톡 프로젝트.";
html=html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${title}</title>`);
if(!/<meta\s+name=["']description["']/i.test(html)) html=html.replace(/<head([^>]*)>/i,`<head$1><meta name="description" content="${description}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="https://dotoristock.com/"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="https://dotoristock.com/"><meta property="og:type" content="website"><script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"WebSite","name":title,"url":"https://dotoristock.com/","description":description})}</script>`);
else html=html.replace(/<meta\s+name=["']description["'][^>]*>/i,`<meta name="description" content="${description}">`);
fs.writeFileSync(path,html);
