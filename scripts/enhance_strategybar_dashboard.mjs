import fs from 'node:fs';

const path='strategybar-runtime/dist/index.html';
let html=fs.readFileSync(path,'utf8');

// Remove every earlier StrategyBar enhancer block so a broken legacy script
// cannot prevent this minimal label-only patch from running.
html=html.replace(/\n?<style id="strategybar-enhancer-style">[\s\S]*?<\/style>\s*/gi,'\n');
html=html.replace(/\n?<script id="strategybar-enhancer-script"[^>]*>[\s\S]*?<\/script>\s*/gi,'\n');

const injection=String.raw`
<script id="strategybar-enhancer-script" data-market-label-version="ko-label-only-v2">
(function(){
  var labels={
    '^GSPC':'S&P 500',
    '^NDX':'나스닥 100',
    '^SOX':'필라델피아 반도체',
    '^RUT':'러셀 2000',
    '^VIX':'VIX',
    'DX-Y.NYB':'달러지수 DXY',
    'KRW=X':'원/달러 환율',
    'CL=F':'WTI 국제유가'
  };

  function replaceMarketLabels(){
    if(!document.body)return;
    var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    var node;
    while((node=walker.nextNode())){
      var raw=node.nodeValue||'';
      var key=raw.trim();
      if(Object.prototype.hasOwnProperty.call(labels,key)){
        node.nodeValue=raw.replace(key,labels[key]);
      }
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',replaceMarketLabels,{once:true});
  }else{
    replaceMarketLabels();
  }
  setInterval(replaceMarketLabels,2000);
})();
</script>`;

html=html.replace(/<\/body>/i,injection+'\n</body>');
fs.writeFileSync(path,html);
console.log('Applied label-only Korean Market Pulse patch v2.');
