export function makeDeedOcr() {
  let worker, stopped=false;
  return {
    async recognize(data, onProgress=()=>{}, {singleLine=true}={}) {
      if(stopped)throw new Error('已取消辨識。');
      const module=await import('tesseract.js');const createWorker=module.createWorker||module.default?.createWorker;if(typeof createWorker!=='function')throw new Error('辨識元件載入失敗，請重新整理後再試。');
      if(!worker)worker=await createWorker('chi_tra',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_best@e12c65a915945e4c28e237a9b52bc4a8f39a0cec',gzip:false,cachePath:'leshan-deed-chi-tra-best-v1',logger:m=>{if(!stopped)onProgress(m.status==='recognizing text'?`辨識中 ${Math.round((m.progress||0)*100)}%`:'第一次使用正在下載辨識資料…');}});
      if(stopped){await worker.terminate();throw new Error('已取消辨識。');}
      await worker.setParameters({tessedit_pageseg_mode:singleLine?'7':'6',preserve_interword_spaces:'1'});
      if(!/^data:image\/(png|jpeg|webp);base64,/.test(data))throw new Error('請提供本機地址圖片。');
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('地址圖無法讀取。'));img.src=data;});
      if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>4000000)throw new Error('地址圖片過大，請裁切成單一地址。');
      const scale=image.naturalHeight<60?2:1,padding=20,canvas=document.createElement('canvas');canvas.width=image.naturalWidth*scale+padding*2;canvas.height=image.naturalHeight*scale+padding*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,padding,padding,image.naturalWidth*scale,image.naturalHeight*scale);
      const result=await worker.recognize(canvas);if(stopped)throw new Error('已取消辨識。');const resultText=result.data.text.normalize('NFKC').replace(/臺/g,'台');return singleLine?resultText.replace(/\s/g,''):resultText.trim();
    },
    async stop(){stopped=true;if(worker)await worker.terminate();}
  };
}
