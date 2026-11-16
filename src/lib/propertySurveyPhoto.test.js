import { imageOf, prepareSurveyPhoto, SURVEY_PHOTO_TIMEOUT_MS } from './propertySurveyPhoto';
import { decodeSurveyHeic } from './surveyHeicDecoder';
jest.mock('./surveyHeicDecoder',()=>({decodeSurveyHeic:jest.fn()}));

const original={Image:global.Image,FileReader:global.FileReader,createImageBitmap:global.createImageBitmap,createObjectURL:URL.createObjectURL,revokeObjectURL:URL.revokeObjectURL};
let context,bitmap,imageMode,readerMode,toBlob;
const photo=(type='image/jpeg',name='photo.jpg')=>new File(['photo'],name,{type});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
beforeEach(()=>{
 imageMode='success';readerMode='success';bitmap={width:4000,height:3000,close:jest.fn()};
 global.createImageBitmap=jest.fn().mockResolvedValue(bitmap);
 decodeSurveyHeic.mockReset().mockResolvedValue(bitmap);
 URL.createObjectURL=jest.fn(()=>'blob:survey-photo');URL.revokeObjectURL=jest.fn();
 global.Image=class{
  constructor(){this.width=4000;this.height=3000;this.naturalWidth=4000;this.naturalHeight=3000;}
  set src(value){this._src=value;if(!value||imageMode==='stall')return;Promise.resolve().then(()=>imageMode==='error'?this.onerror?.():this.onload?.());}
  get src(){return this._src;}
 };
 global.FileReader=class{
  constructor(){this.readyState=0;}
  readAsDataURL(){this.readyState=1;if(readerMode==='stall')return;Promise.resolve().then(()=>{if(this.readyState!==1)return;this.readyState=2;this.result='data:image/jpeg;base64,cGhvdG8=';this.onload?.();});}
  abort(){this.readyState=2;this.onabort?.();}
 };
 context={fillStyle:'',fillRect:jest.fn(),drawImage:jest.fn()};
 jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
 toBlob=jest.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(callback=>Promise.resolve().then(()=>callback(new Blob(['encoded'],{type:'image/jpeg'}))));
});
afterEach(()=>{
 jest.restoreAllMocks();jest.useRealTimers();
 for(const [key,value]of Object.entries(original)){
  if(['createObjectURL','revokeObjectURL'].includes(key)){if(value)URL[key]=value;else delete URL[key];}
  else if(value)global[key]=value;else delete global[key];
 }
});
test('ordinary photos resize asynchronously, stay below the saved-photo limit and release decoded memory',async()=>{
 const stage=jest.fn();const result=await prepareSurveyPhoto(photo(),{onStage:stage});
 expect(result).toMatch(/^data:image\/jpeg;base64,/);expect(result.length).toBeLessThan(500000);
 expect(context.drawImage).toHaveBeenCalledWith(bitmap,0,0,1600,1200);expect(toBlob).toHaveBeenCalled();expect(bitmap.close).toHaveBeenCalledTimes(1);
 expect(stage).toHaveBeenCalledWith('正在準備照片預覽…');expect(decodeSurveyHeic).not.toHaveBeenCalled();
});
test('a failed bitmap decoder falls back to the browser image decoder and revokes its temporary URL',async()=>{
 global.createImageBitmap.mockRejectedValue(new Error('unsupported'));
 await expect(prepareSurveyPhoto(photo())).resolves.toMatch(/^data:image\/jpeg/);
 expect(URL.createObjectURL).toHaveBeenCalledTimes(1);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:survey-photo');
});
test('HEIC photos use the local decoder instead of hanging in an unsupported browser image loader',async()=>{
 const file=photo('image/heic','IMG_01.HEIC'),onStage=jest.fn();
 await expect(prepareSurveyPhoto(file,{onStage})).resolves.toMatch(/^data:image\/jpeg/);
 expect(decodeSurveyHeic).toHaveBeenCalledWith(file,expect.objectContaining({signal:expect.anything()}));
 expect(global.createImageBitmap).not.toHaveBeenCalled();expect(onStage.mock.calls.some(([text])=>text.includes('HEIC'))).toBe(true);
});
test('empty files, oversized files and non-photo files fail without starting a decoder',async()=>{
 await expect(prepareSurveyPhoto(new File([],'empty.jpg',{type:'image/jpeg'}))).rejects.toThrow('完整下載');
 await expect(prepareSurveyPhoto({size:16*1024*1024,type:'image/jpeg'})).rejects.toThrow('15MB');
 await expect(prepareSurveyPhoto(photo('application/pdf','wrong.pdf'))).rejects.toThrow('不支援');
 expect(global.createImageBitmap).not.toHaveBeenCalled();expect(decodeSurveyHeic).not.toHaveBeenCalled();
});
test('an image loader that never reports completion times out and removes handlers',async()=>{
 jest.useFakeTimers();imageMode='stall';
 const failure=imageOf('blob:unreadable').catch(error=>error);
 jest.advanceTimersByTime(12000);
 expect((await failure).message).toContain('逾時');expect(jest.getTimerCount()).toBe(0);
});
test('a stalled encoder times out rather than retaining the busy state forever',async()=>{
 jest.useFakeTimers();toBlob.mockImplementation(()=>{});
 const failure=prepareSurveyPhoto(photo()).catch(error=>error);await flush();
 jest.advanceTimersByTime(SURVEY_PHOTO_TIMEOUT_MS);await flush();
 expect((await failure).message).toContain('逾時');expect(bitmap.close).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
});
test('cancellation rejects promptly and closes a bitmap which finishes after the job was cancelled',async()=>{
 let finish;global.createImageBitmap.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const controller=new AbortController();const failure=prepareSurveyPhoto(photo(),{signal:controller.signal}).catch(error=>error);
 controller.abort();expect((await failure).name).toBe('AbortError');finish(bitmap);await flush();
 expect(bitmap.close).toHaveBeenCalledTimes(1);expect(context.drawImage).not.toHaveBeenCalled();
});
test('a stalled HEIC conversion is bounded and does not block later ordinary photos',async()=>{
 jest.useFakeTimers();decodeSurveyHeic.mockImplementation(()=>new Promise(()=>{}));
 const failure=prepareSurveyPhoto(photo('image/heic','photo.heic')).catch(error=>error);await flush();
 jest.advanceTimersByTime(SURVEY_PHOTO_TIMEOUT_MS);await flush();expect((await failure).message).toContain('逾時');
 await expect(prepareSurveyPhoto(photo())).resolves.toMatch(/^data:image\/jpeg/);
});
test('a stalled FileReader is cancelled by the overall deadline',async()=>{
 jest.useFakeTimers();readerMode='stall';
 const failure=prepareSurveyPhoto(photo()).catch(error=>error);await flush();
 jest.advanceTimersByTime(SURVEY_PHOTO_TIMEOUT_MS);await flush();expect((await failure).message).toContain('逾時');expect(bitmap.close).toHaveBeenCalledTimes(1);
});
test('unreasonably large image dimensions fail before drawing or encoding',async()=>{
 bitmap.width=20000;bitmap.height=20000;
 await expect(prepareSurveyPhoto(photo())).rejects.toThrow('尺寸過大');expect(toBlob).not.toHaveBeenCalled();expect(bitmap.close).toHaveBeenCalledTimes(1);
});
