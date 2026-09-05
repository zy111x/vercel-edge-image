const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

const landingView=$('#landingView');
const studioView=$('#studioView');
const fileInput=$('#fileInput');
const chooseFileButton=$('#chooseFileButton');
const dropZone=$('#dropZone');
const urlForm=$('#urlForm');
const urlInput=$('#urlInput');
const previewCanvas=$('#previewCanvas');
const previewImage=$('#previewImage');
const canvasStage=$('#canvasStage');
const processingMask=$('#processingMask');
const toolPanel=$('#toolPanel');
const toolTitle=$('#toolTitle');
const toolBadge=$('#toolBadge');
const imageName=$('#imageName');
const imageDimensions=$('#imageDimensions');
const pipelineChips=$('#pipelineChips');
const pipelineCount=$('#pipelineCount');
const runButton=$('#runButton');
const downloadButton=$('#downloadButton');
const exportSummary=$('#exportSummary');
const newImageButton=$('#newImageButton');
const compareButton=$('#compareButton');
const fitButton=$('#fitButton');
const undoButton=$('#undoButton');
const redoButton=$('#redoButton');
const resetButton=$('#resetButton');
const previewMode=$('#previewMode');
const toast=$('#toast');

const TOOL_META={
  resize:['缩放图片','Resize'],crop:['裁剪图片','Crop'],rotate:['旋转与翻转','Rotate'],
  filter:['滤镜风格','Filter'],adjust:['亮度与对比度','Adjust'],watermark:['图片水印','Watermark'],
  text:['文字水印','Text'],format:['格式与质量','Export'],pipeline:['处理管线','Pipeline']
};
const EFFECT_TOOLS=new Set(['resize','crop','rotate','filter','adjust','watermark','text']);
const FILTERS=[['oceanic','海洋'],['islands','岛屿'],['marine','深海'],['seagreen','海松'],['flagblue','钴蓝'],['liquid','流光'],['diamante','钻石'],['radio','辐射'],['twenties','二十年代'],['rosetint','玫瑰'],['mauve','淡紫'],['bluechrome','蓝铬'],['vintage','复古'],['perfume','香氛'],['serenity','宁静']];
const FILTER_PREVIEW={
  oceanic:'saturate(1.15) hue-rotate(155deg) brightness(.96)',islands:'saturate(1.12) hue-rotate(145deg) brightness(1.04)',
  marine:'saturate(1.25) hue-rotate(125deg) contrast(1.05)',seagreen:'sepia(.16) saturate(1.3) hue-rotate(95deg) brightness(.86)',
  flagblue:'saturate(1.3) hue-rotate(175deg)',liquid:'saturate(1.4) hue-rotate(165deg) contrast(1.08)',
  diamante:'saturate(1.2) hue-rotate(145deg) contrast(1.12)',radio:'sepia(.38) saturate(1.5) contrast(1.15) hue-rotate(25deg)',
  twenties:'sepia(.22) saturate(.8) contrast(.92) hue-rotate(175deg)',rosetint:'sepia(.2) saturate(1.25) hue-rotate(300deg)',
  mauve:'sepia(.15) saturate(1.2) hue-rotate(245deg)',bluechrome:'grayscale(.35) sepia(.2) saturate(1.5) hue-rotate(175deg)',
  vintage:'sepia(.38) saturate(.85) contrast(.95) brightness(.96)',perfume:'saturate(1.16) hue-rotate(185deg) brightness(1.04)',
  serenity:'saturate(.9) hue-rotate(185deg) brightness(1.08)'
};
const DEFAULT_OUTPUT={format:'webp',quality:92};
const MAX_PREVIEW_PIXELS=2800000;
const imageCache=new Map();

const state={
  sourceFile:null,sourceUrl:'',sourceName:'',sourceObjectUrl:'',sourceImage:null,
  width:0,height:0,activeTool:'resize',pipeline:[],output:{...DEFAULT_OUTPUT},selectedFilter:'vintage',
  watermarkFile:null,watermarkName:'',watermarkPreviewUrl:'',resizeLock:true,ratio:1,busy:false,
  panelDirty:false,history:[],historyIndex:-1,renderTimer:null,renderToken:0,
  resultBlob:null,resultPreview:'',exactMode:false,previewLogicalWidth:0,previewLogicalHeight:0
};

const clone=v=>JSON.parse(JSON.stringify(v));
const opName=a=>({resize:'缩放',crop:'裁剪',rotate:'旋转',fliph:'水平翻转',flipv:'垂直翻转',filter:'滤镜',adjust_brightness:'亮度',adjust_contrast:'对比度',watermark:'图片水印',draw_text:'文字水印'}[a]||a);
const opSummary=o=>{const p=o.params||[];if(o.action==='resize')return `${p[0]} × ${p[1]}`;if(o.action==='crop')return `(${p[0]}, ${p[1]}) → (${p[2]}, ${p[3]})`;if(o.action==='rotate')return `${p[0]}°`;if(o.action==='filter')return String(p[0]||'');if(o.action==='watermark')return `${p[1]}, ${p[2]}`;if(o.action==='draw_text')return `“${String(p[0]).slice(0,12)}”`;return p.join(', ')};
let toastTimer;
function showToast(message,type=''){clearTimeout(toastTimer);toast.textContent=message;toast.className=`toast show ${type}`.trim();toastTimer=setTimeout(()=>toast.className='toast',2200)}
function revoke(url){if(url&&url.startsWith('blob:'))URL.revokeObjectURL(url)}
function setBusy(value){state.busy=value;processingMask.hidden=!value;runButton.disabled=value;downloadButton.disabled=value||!state.sourceImage}
function setPreviewMode(exact){state.exactMode=exact;previewMode.classList.toggle('exact',exact);previewMode.innerHTML=`<span></span>${exact?'Photon 精确结果':'浏览器即时预览'}`}
function invalidateExact(){if(state.exactMode){state.exactMode=false;previewImage.hidden=true;previewCanvas.hidden=false;setPreviewMode(false)}}
function updateExport(){const label=state.output.format==='jpg'?'JPEG':state.output.format.toUpperCase();exportSummary.textContent=state.output.format==='png'?`${label} · 无损`:`${label} · ${state.output.quality}%`}

function snapshot(){return {pipeline:clone(state.pipeline),output:{...state.output}}}
function sameSnapshot(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function initHistory(){state.history=[snapshot()];state.historyIndex=0;updateHistoryButtons()}
function pushHistory(){const next=snapshot(),current=state.history[state.historyIndex];if(current&&sameSnapshot(current,next))return;state.history=state.history.slice(0,state.historyIndex+1);state.history.push(next);if(state.history.length>60)state.history.shift();else state.historyIndex++;if(state.history.length===60)state.historyIndex=59;updateHistoryButtons()}
function updateHistoryButtons(){undoButton.disabled=state.historyIndex<=0&&!state.panelDirty;redoButton.disabled=state.historyIndex<0||state.historyIndex>=state.history.length-1}
function restoreSnapshot(index){if(index<0||index>=state.history.length)return;state.historyIndex=index;const s=state.history[index];state.pipeline=clone(s.pipeline);state.output={...s.output};state.panelDirty=false;invalidateExact();renderPipeline();renderToolPanel();scheduleLivePreview(0);updateHistoryButtons();updateExport()}
function undo(){if(state.panelDirty){state.panelDirty=false;renderToolPanel();scheduleLivePreview(0);updateHistoryButtons();showToast('已撤销当前参数调整。');return}if(state.historyIndex>0){restoreSnapshot(state.historyIndex-1);showToast('已撤销。')}}
function redo(){if(state.historyIndex<state.history.length-1){restoreSnapshot(state.historyIndex+1);showToast('已重做。')}}
function resetEdits(){if(!state.sourceImage)return;if(state.panelDirty||state.pipeline.length||JSON.stringify(state.output)!==JSON.stringify(DEFAULT_OUTPUT)){state.panelDirty=false;state.pipeline=[];state.output={...DEFAULT_OUTPUT};invalidateExact();pushHistory();renderPipeline();renderToolPanel();scheduleLivePreview(0);updateExport();showToast('已重置所有处理，可撤销恢复。')}}

function previewSize(w,h){w=Math.max(1,Number(w)||1);h=Math.max(1,Number(h)||1);const scale=Math.min(1,Math.sqrt(MAX_PREVIEW_PIXELS/(w*h)));return {w:Math.max(1,Math.round(w*scale)),h:Math.max(1,Math.round(h*scale)),scale}}
function makeCanvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
function currentLogicalSize(ops=state.pipeline){let w=state.width||1,h=state.height||1;for(const op of ops){const p=op.params||[];if(op.action==='resize'){w=Math.max(1,Number(p[0])||w);h=Math.max(1,Number(p[1])||h)}else if(op.action==='crop'){w=Math.max(1,(Number(p[2])||w)-(Number(p[0])||0));h=Math.max(1,(Number(p[3])||h)-(Number(p[1])||0))}else if(op.action==='rotate'){const rad=(Number(p[0])||0)*Math.PI/180,co=Math.abs(Math.cos(rad)),si=Math.abs(Math.sin(rad));const nw=w*co+h*si,nh=w*si+h*co;w=Math.max(1,Math.round(nw));h=Math.max(1,Math.round(nh))}}return {w:Math.round(w),h:Math.round(h)}}
function drawFiltered(source,filter){const out=makeCanvas(source.width,source.height),ctx=out.getContext('2d');ctx.filter=filter;ctx.drawImage(source,0,0);ctx.filter='none';return out}
function loadImage(url){if(!url)return Promise.reject(new Error('empty image url'));if(imageCache.has(url))return imageCache.get(url);const promise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('无法载入图片'));img.src=url});imageCache.set(url,promise);return promise}

async function applyPreviewOp(work,logical,op,token){const p=op.params||[];if(token!==state.renderToken)return {work,logical};
  if(op.action==='resize'){
    const lw=Math.max(1,Math.round(Number(p[0])||logical.w)),lh=Math.max(1,Math.round(Number(p[1])||logical.h)),ps=previewSize(lw,lh),out=makeCanvas(ps.w,ps.h);out.getContext('2d').drawImage(work,0,0,out.width,out.height);return {work:out,logical:{w:lw,h:lh}};
  }
  if(op.action==='crop'){
    const x1=Math.max(0,Math.min(logical.w,Number(p[0])||0)),y1=Math.max(0,Math.min(logical.h,Number(p[1])||0)),x2=Math.max(x1+1,Math.min(logical.w,Number(p[2])||logical.w)),y2=Math.max(y1+1,Math.min(logical.h,Number(p[3])||logical.h));
    const lw=Math.max(1,x2-x1),lh=Math.max(1,y2-y1),ps=previewSize(lw,lh),out=makeCanvas(ps.w,ps.h),ctx=out.getContext('2d'),sx=work.width/logical.w,sy=work.height/logical.h;ctx.drawImage(work,x1*sx,y1*sy,lw*sx,lh*sy,0,0,out.width,out.height);return {work:out,logical:{w:lw,h:lh}};
  }
  if(op.action==='rotate'){
    const angle=Number(p[0])||0,rad=angle*Math.PI/180,co=Math.abs(Math.cos(rad)),si=Math.abs(Math.sin(rad)),lw=Math.max(1,Math.round(logical.w*co+logical.h*si)),lh=Math.max(1,Math.round(logical.w*si+logical.h*co)),ps=previewSize(lw,lh),out=makeCanvas(ps.w,ps.h),ctx=out.getContext('2d');ctx.translate(out.width/2,out.height/2);ctx.rotate(rad);const scale=Math.min(out.width/lw,out.height/lh);ctx.drawImage(work,-logical.w*scale/2,-logical.h*scale/2,logical.w*scale,logical.h*scale);return {work:out,logical:{w:lw,h:lh}};
  }
  if(op.action==='fliph'||op.action==='flipv'){
    const out=makeCanvas(work.width,work.height),ctx=out.getContext('2d');ctx.translate(op.action==='fliph'?out.width:0,op.action==='flipv'?out.height:0);ctx.scale(op.action==='fliph'?-1:1,op.action==='flipv'?-1:1);ctx.drawImage(work,0,0);return {work:out,logical};
  }
  if(op.action==='adjust_brightness'){const v=Math.max(-100,Math.min(100,Number(p[0])||0));return {work:drawFiltered(work,`brightness(${Math.max(.05,1+v/100)})`),logical}}
  if(op.action==='adjust_contrast'){const v=Math.max(-100,Math.min(100,Number(p[0])||0));return {work:drawFiltered(work,`contrast(${Math.max(.05,1+v/100)})`),logical}}
  if(op.action==='filter'){return {work:drawFiltered(work,FILTER_PREVIEW[String(p[0])]||'none'),logical}}
  if(op.action==='watermark'){
    const src=p[0]==='__watermark__'?state.watermarkPreviewUrl:String(p[0]||'');if(!src)return {work,logical};try{const wm=await loadImage(src);if(token!==state.renderToken)return {work,logical};const out=makeCanvas(work.width,work.height),ctx=out.getContext('2d');ctx.drawImage(work,0,0);const scale=work.width/logical.w,x=(Number(p[1])||0)*scale,y=(Number(p[2])||0)*scale;ctx.globalAlpha=.9;ctx.drawImage(wm,x,y,wm.naturalWidth*scale,wm.naturalHeight*scale);ctx.globalAlpha=1;return {work:out,logical}}catch{return {work,logical}}
  }
  if(op.action==='draw_text'){
    const out=makeCanvas(work.width,work.height),ctx=out.getContext('2d');ctx.drawImage(work,0,0);const scale=work.width/logical.w,fontLogical=Math.max(18,Math.min(64,logical.w/32));ctx.font=`600 ${fontLogical*scale}px ui-sans-serif,system-ui,sans-serif`;ctx.textBaseline='top';ctx.fillStyle='rgba(255,255,255,.92)';ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=4*scale;ctx.fillText(String(p[0]||''),(Number(p[1])||0)*scale,(Number(p[2])||0)*scale);return {work:out,logical};
  }
  return {work,logical};
}

function getDraftOps(strict=false){if(!state.panelDirty||!EFFECT_TOOLS.has(state.activeTool))return[];return opsFromPanel(strict)}
function effectiveOps(){let draft=[];try{draft=getDraftOps(false)}catch{}return [...state.pipeline,...draft]}
async function renderPreview(ops=effectiveOps()){
  if(!state.sourceImage)return;const token=++state.renderToken;const sourceLogical={w:state.width,h:state.height},ps=previewSize(sourceLogical.w,sourceLogical.h);let work=makeCanvas(ps.w,ps.h),logical={...sourceLogical};work.getContext('2d').drawImage(state.sourceImage,0,0,work.width,work.height);
  for(const op of ops){const next=await applyPreviewOp(work,logical,op,token);if(token!==state.renderToken)return;work=next.work;logical=next.logical}
  if(token!==state.renderToken)return;previewCanvas.width=work.width;previewCanvas.height=work.height;previewCanvas.getContext('2d').drawImage(work,0,0);state.previewLogicalWidth=Math.round(logical.w);state.previewLogicalHeight=Math.round(logical.h);imageDimensions.textContent=`${state.previewLogicalWidth} × ${state.previewLogicalHeight}`;previewImage.hidden=true;previewCanvas.hidden=false;setPreviewMode(false)
}
function scheduleLivePreview(delay=45){clearTimeout(state.renderTimer);invalidateExact();state.renderTimer=setTimeout(()=>renderPreview(),delay)}

function markDirty(){state.panelDirty=true;updateHistoryButtons();scheduleLivePreview()}
function showStudio(){landingView.hidden=true;studioView.hidden=false;newImageButton.hidden=false;renderToolPanel();renderPipeline()}
function clearResult(){revoke(state.resultPreview);state.resultPreview='';state.resultBlob=null;state.exactMode=false}
function resetSourceState(){clearTimeout(state.renderTimer);state.renderToken++;revoke(state.sourceObjectUrl);revoke(state.resultPreview);revoke(state.watermarkPreviewUrl);imageCache.clear();Object.assign(state,{sourceFile:null,sourceUrl:'',sourceName:'',sourceObjectUrl:'',sourceImage:null,width:0,height:0,activeTool:'resize',pipeline:[],output:{...DEFAULT_OUTPUT},selectedFilter:'vintage',watermarkFile:null,watermarkName:'',watermarkPreviewUrl:'',resizeLock:true,ratio:1,busy:false,panelDirty:false,history:[],historyIndex:-1,resultBlob:null,resultPreview:'',exactMode:false,previewLogicalWidth:0,previewLogicalHeight:0})}
function resetStudio(){resetSourceState();previewCanvas.width=1;previewCanvas.height=1;previewCanvas.hidden=true;previewImage.hidden=true;previewImage.removeAttribute('src');downloadButton.disabled=true;compareButton.disabled=true;landingView.hidden=false;studioView.hidden=true;newImageButton.hidden=true;urlInput.value='';fileInput.value='';updateHistoryButtons();updateExport()}
async function loadSource(src,name){try{const img=await loadImage(src);state.sourceImage=img;state.sourceName=name||'image';state.width=img.naturalWidth;state.height=img.naturalHeight;state.ratio=state.height?state.width/state.height:1;state.pipeline=[];state.output={...DEFAULT_OUTPUT};state.activeTool='resize';state.panelDirty=false;clearResult();imageName.textContent=state.sourceName;downloadButton.disabled=false;compareButton.disabled=false;initHistory();showStudio();await renderPreview([])}catch{showToast('无法预览这张图片，请检查 URL 或图片权限。','error')}}
function loadLocalFile(file){if(!file||!file.type.startsWith('image/'))return showToast('请选择有效的图片文件。','error');resetSourceState();const url=URL.createObjectURL(file);state.sourceFile=file;state.sourceObjectUrl=url;loadSource(url,file.name||'local-image')}
function loadRemoteUrl(url){let normalized;try{normalized=new URL(url).toString()}catch{return showToast('请输入完整、有效的图片 URL。','error')}resetSourceState();state.sourceUrl=normalized;let name='remote-image';try{name=decodeURIComponent(new URL(normalized).pathname.split('/').pop()||'remote-image')}catch{}loadSource(normalized,name)}
function setTool(tool){if(!TOOL_META[tool])return;if(state.panelDirty){state.panelDirty=false;scheduleLivePreview(0)}state.activeTool=tool;$$('.tool-button').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));renderToolPanel()}

const liveHint=(extra='')=>`<div class="live-hint"><span></span><div>修改参数会立即在中间画布预览，无需请求服务器。${extra}</div></div>`;
const actions=()=>`<div class="panel-actions live-actions"><button class="secondary-action" type="button" data-action="reset-param">重置参数</button><button class="primary-action" type="button" data-action="apply">应用此效果</button></div>`;
function resizePanel(){const d=currentLogicalSize(),w=d.w,h=d.h;return `${liveHint()}<div class="field-grid"><label class="field"><span>宽度</span><div class="input-suffix"><input id="resizeWidth" type="number" min="1" value="${w}"><em>px</em></div></label><label class="field"><span>高度</span><div class="input-suffix"><input id="resizeHeight" type="number" min="1" value="${h}"><em>px</em></div></label></div><div class="toggle-line"><span>锁定当前比例</span><button class="toggle ${state.resizeLock?'on':''}" id="ratioToggle" type="button"></button></div><span class="section-label">快速尺寸</span><div class="preset-row"><button class="preset-button" data-size="1920,1080">1920×1080</button><button class="preset-button" data-size="1280,720">1280×720</button><button class="preset-button" data-size="1080,1080">1080×1080</button><button class="preset-button" data-size="800,600">800×600</button></div><span class="section-label">采样方式</span><label class="field"><select id="resizeFilter"><option value="1">Nearest · 最快</option><option value="2">Triangle · 线性</option><option value="3" selected>CatmullRom · 推荐</option><option value="4">Gaussian · 柔和</option><option value="5">Lanczos3 · 高质量</option></select></label>${actions()}`}
function cropPanel(){const d=currentLogicalSize();return `${liveHint('最终导出仍由 Photon 精确裁剪。')}<div class="field-grid"><label class="field"><span>左 X</span><input id="cropX1" type="number" value="0"></label><label class="field"><span>上 Y</span><input id="cropY1" type="number" value="0"></label><label class="field"><span>右 X</span><input id="cropX2" type="number" value="${d.w}"></label><label class="field"><span>下 Y</span><input id="cropY2" type="number" value="${d.h}"></label></div><span class="section-label">常用比例</span><div class="preset-row"><button class="preset-button" data-crop-ratio="1">1:1</button><button class="preset-button" data-crop-ratio="1.333333">4:3</button><button class="preset-button" data-crop-ratio="1.777778">16:9</button><button class="preset-button" data-crop-ratio="0.75">3:4</button><button class="preset-button" data-crop-ratio="0.5625">9:16</button></div>${actions()}`}
function rotatePanel(){return `${liveHint()}<label class="field"><span>旋转角度</span><div class="input-suffix"><input id="rotateAngle" type="number" value="90"><em>°</em></div></label><div class="preset-row"><button class="preset-button" data-angle="90">90°</button><button class="preset-button" data-angle="180">180°</button><button class="preset-button" data-angle="270">270°</button><button class="preset-button" data-angle="-90">-90°</button></div>${actions()}<span class="section-label">快速翻转（立即应用）</span><div class="field-grid"><button class="secondary-action" data-special="fliph">↔ 水平翻转</button><button class="secondary-action" data-special="flipv">↕ 垂直翻转</button></div>`}
function filterPanel(){return `${liveHint('滤镜在浏览器中使用近似视觉预览，精确效果以 Photon 导出结果为准。')}<div class="filter-grid">${FILTERS.map(([id,name])=>`<button class="filter-card ${state.selectedFilter===id?'selected':''}" data-filter="${id}"><span>${name}</span></button>`).join('')}</div><div class="preview-approx">即时滤镜是低延迟近似预览；点击“精确预览”或“导出图片”会使用 Photon 的真实滤镜。</div>${actions()}`}
function adjustPanel(){return `${liveHint()}<span class="section-label">亮度</span><div class="range-row"><input id="brightnessRange" type="range" min="-100" max="100" value="0"><span class="range-value" id="brightnessValue">0</span></div><span class="section-label">对比度</span><div class="range-row"><input id="contrastRange" type="range" min="-100" max="100" value="0"><span class="range-value" id="contrastValue">0</span></div>${actions()}`}
function watermarkPanel(){return `${liveHint()}<span class="section-label">水印图片</span><label class="upload-mini" for="watermarkFile"><strong>${state.watermarkName||'选择本地水印'}</strong><span>${state.watermarkName?'点击可更换文件':'PNG / JPEG / WEBP'}</span></label><input id="watermarkFile" type="file" accept="image/*" hidden><div class="divider"><span>或者使用 URL</span></div><input class="url-watermark-input" id="watermarkUrl" type="url" placeholder="https://.../logo.png"><div class="field-grid" style="margin-top:12px"><label class="field"><span>X 坐标</span><input id="watermarkX" type="number" value="24"></label><label class="field"><span>Y 坐标</span><input id="watermarkY" type="number" value="24"></label></div>${actions()}`}
function textPanel(){return `${liveHint('文字即时预览使用系统字体，Photon 最终渲染可能略有差异。')}<label class="field"><span>水印文字</span><textarea id="watermarkText">Edge Image Studio</textarea></label><div class="field-grid" style="margin-top:12px"><label class="field"><span>X 坐标</span><input id="textX" type="number" value="24"></label><label class="field"><span>Y 坐标</span><input id="textY" type="number" value="24"></label></div>${actions()}`}
function formatPanel(){return `${liveHint('格式与质量不会影响编辑速度，只在精确预览和导出时编码。')}<label class="field"><span>输出格式</span><select id="outputFormat"><option value="webp" ${state.output.format==='webp'?'selected':''}>WEBP · 推荐</option><option value="jpg" ${state.output.format==='jpg'?'selected':''}>JPEG</option><option value="png" ${state.output.format==='png'?'selected':''}>PNG · 无损</option></select></label><span class="section-label">输出质量</span><div class="range-row"><input id="qualityRange" type="range" min="1" max="100" value="${state.output.quality}" ${state.output.format==='png'?'disabled':''}><span class="range-value" id="qualityValue">${state.output.quality}</span></div><div class="exact-note">“导出图片”会自动执行当前全部处理，无需先点精确预览。</div>`}
function legacyAction(){return state.pipeline.map(o=>`${o.action}${(o.params||[]).length?'!'+o.params.join(','):''}`).join('|')}
function apiUrl(){if(!state.sourceUrl)return'';const u=new URL('/api',location.origin);u.searchParams.set('url',state.sourceUrl);if(state.pipeline.length)u.searchParams.set('action',legacyAction());u.searchParams.set('format',state.output.format);u.searchParams.set('quality',String(state.output.quality));return u.toString()}
function pipelinePanel(){const items=state.pipeline.length?state.pipeline.map((o,i)=>`<div class="pipeline-item"><span class="pipeline-index">${i+1}</span><div><strong>${opName(o.action)}</strong><small>${opSummary(o)}</small></div><div class="pipeline-item-actions"><button data-move="up" data-index="${i}">↑</button><button data-move="down" data-index="${i}">↓</button><button data-remove="${i}">×</button></div></div>`).join(''):'<div class="empty-card">当前还没有已应用的处理步骤。<br>选择左侧工具，参数变化会先即时预览。</div>';const url=apiUrl();return `${liveHint('调整流程顺序也会立刻重新渲染本地预览。')}<div class="pipeline-list">${items}</div>${url?`<span class="section-label">兼容 API URL</span><div class="code-card">${url}</div><button class="secondary-action" id="copyApiButton" style="width:100%;margin-top:8px">复制 API URL</button>`:''}${state.pipeline.length?'<button class="secondary-action" id="clearPipeline" style="width:100%;margin-top:12px;color:#ffadb6">清空处理流程</button>':''}`}

function renderToolPanel(){const [title,badge]=TOOL_META[state.activeTool];toolTitle.textContent=title;toolBadge.textContent=badge;const map={resize:resizePanel,crop:cropPanel,rotate:rotatePanel,filter:filterPanel,adjust:adjustPanel,watermark:watermarkPanel,text:textPanel,format:formatPanel,pipeline:pipelinePanel};toolPanel.innerHTML=map[state.activeTool]();bindPanel();updateExport()}
function centeredCrop(ratio){const d=currentLogicalSize(),cr=d.w/d.h;let cw=d.w,ch=d.h;if(cr>ratio)cw=Math.round(d.h*ratio);else ch=Math.round(d.w/ratio);const x=Math.max(0,Math.round((d.w-cw)/2)),y=Math.max(0,Math.round((d.h-ch)/2));$('#cropX1').value=x;$('#cropY1').value=y;$('#cropX2').value=x+cw;$('#cropY2').value=y+ch;markDirty()}
function opsFromPanel(strict=true){switch(state.activeTool){case'resize':return[{action:'resize',params:[Math.max(1,Math.round(Number($('#resizeWidth').value)||1)),Math.max(1,Math.round(Number($('#resizeHeight').value)||1)),Number($('#resizeFilter').value)||3]}];case'crop':{const values=['#cropX1','#cropY1','#cropX2','#cropY2'].map(id=>Math.round(Number($(id).value)||0));if(values[2]<=values[0]||values[3]<=values[1]){if(strict)throw Error('裁剪区域无效。');return[]}return[{action:'crop',params:values}]}case'rotate':return[{action:'rotate',params:[Number($('#rotateAngle').value)||0]}];case'filter':return[{action:'filter',params:[state.selectedFilter]}];case'adjust':{const b=Number($('#brightnessRange').value)||0,c=Number($('#contrastRange').value)||0,ops=[];if(b)ops.push({action:'adjust_brightness',params:[b]});if(c)ops.push({action:'adjust_contrast',params:[c]});if(!ops.length&&strict)throw Error('亮度与对比度都为 0。');return ops}case'watermark':{const remote=($('#watermarkUrl').value||'').trim(),src=state.watermarkFile?'__watermark__':remote;if(!src){if(strict)throw Error('请上传水印图片或填写 URL。');return[]}return[{action:'watermark',params:[src,Math.max(0,Number($('#watermarkX').value)||0),Math.max(0,Number($('#watermarkY').value)||0)]}]}case'text':{const text=($('#watermarkText').value||'').trim();if(!text){if(strict)throw Error('请输入水印文字。');return[]}return[{action:'draw_text',params:[text,Math.max(0,Number($('#textX').value)||0),Math.max(0,Number($('#textY').value)||0)]}]}default:return[]}}
function commitDraft(silent=false){if(!state.panelDirty||!EFFECT_TOOLS.has(state.activeTool))return false;const ops=opsFromPanel(true);if(ops.length)state.pipeline.push(...ops);state.panelDirty=false;invalidateExact();pushHistory();renderPipeline();renderToolPanel();scheduleLivePreview(0);if(!silent)showToast(`已应用 ${ops.map(o=>opName(o.action)).join(' + ')}。`);return true}

function bindPanel(){
  const resetParam=$('[data-action="reset-param"]',toolPanel);if(resetParam)resetParam.onclick=()=>{state.panelDirty=false;renderToolPanel();scheduleLivePreview(0);updateHistoryButtons()};
  const apply=$('[data-action="apply"]',toolPanel);if(apply)apply.onclick=()=>{try{commitDraft()}catch(e){showToast(e.message,'error')}};
  toolPanel.querySelectorAll('[data-size]').forEach(btn=>btn.onclick=()=>{const [w,h]=btn.dataset.size.split(',');$('#resizeWidth').value=w;$('#resizeHeight').value=h;markDirty()});
  const ratioToggle=$('#ratioToggle',toolPanel);if(ratioToggle){ratioToggle.onclick=()=>{state.resizeLock=!state.resizeLock;ratioToggle.classList.toggle('on',state.resizeLock)};const w=$('#resizeWidth'),h=$('#resizeHeight');const d=currentLogicalSize(),ratio=d.h?d.w/d.h:1;w.oninput=()=>{if(state.resizeLock&&ratio)h.value=Math.max(1,Math.round(Number(w.value)/ratio));markDirty()};h.oninput=()=>{if(state.resizeLock&&ratio)w.value=Math.max(1,Math.round(Number(h.value)*ratio));markDirty()};$('#resizeFilter').onchange=markDirty}
  toolPanel.querySelectorAll('[data-crop-ratio]').forEach(btn=>btn.onclick=()=>centeredCrop(Number(btn.dataset.cropRatio)));
  ['#cropX1','#cropY1','#cropX2','#cropY2'].forEach(id=>{const el=$(id,toolPanel);if(el)el.oninput=markDirty});
  toolPanel.querySelectorAll('[data-angle]').forEach(btn=>btn.onclick=()=>{$('#rotateAngle').value=btn.dataset.angle;markDirty()});const angle=$('#rotateAngle',toolPanel);if(angle)angle.oninput=markDirty;
  toolPanel.querySelectorAll('[data-special]').forEach(btn=>btn.onclick=()=>{if(state.panelDirty){state.panelDirty=false}state.pipeline.push({action:btn.dataset.special,params:[]});invalidateExact();pushHistory();renderPipeline();renderToolPanel();scheduleLivePreview(0);showToast(`已应用${opName(btn.dataset.special)}。`)});
  toolPanel.querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{state.selectedFilter=btn.dataset.filter;toolPanel.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x===btn));markDirty()});
  [['brightnessRange','brightnessValue'],['contrastRange','contrastValue']].forEach(([r,v])=>{const input=$('#'+r),value=$('#'+v);if(input&&value)input.oninput=()=>{value.textContent=input.value;markDirty()}});
  const wm=$('#watermarkFile');if(wm)wm.onchange=()=>{const file=wm.files[0];if(file){revoke(state.watermarkPreviewUrl);state.watermarkFile=file;state.watermarkName=file.name;state.watermarkPreviewUrl=URL.createObjectURL(file);imageCache.delete(state.watermarkPreviewUrl);state.panelDirty=true;renderToolPanel();scheduleLivePreview(0);updateHistoryButtons()}};
  const wmUrl=$('#watermarkUrl');if(wmUrl)wmUrl.oninput=markDirty;['#watermarkX','#watermarkY','#watermarkText','#textX','#textY'].forEach(id=>{const el=$(id,toolPanel);if(el)el.oninput=markDirty});
  const format=$('#outputFormat');if(format)format.onchange=()=>{state.output.format=format.value;updateExport();pushHistory();renderToolPanel();invalidateExact()};
  const quality=$('#qualityRange');if(quality){const value=$('#qualityValue');quality.oninput=()=>{state.output.quality=Math.max(1,Math.min(100,Number(quality.value)||92));value.textContent=state.output.quality;updateExport();invalidateExact()};quality.onchange=pushHistory}
  toolPanel.querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=()=>{state.pipeline.splice(Number(btn.dataset.remove),1);state.panelDirty=false;invalidateExact();pushHistory();renderPipeline();renderToolPanel();scheduleLivePreview(0)});
  toolPanel.querySelectorAll('[data-move]').forEach(btn=>btn.onclick=()=>{const i=Number(btn.dataset.index),j=btn.dataset.move==='up'?i-1:i+1;if(j<0||j>=state.pipeline.length)return;[state.pipeline[i],state.pipeline[j]]=[state.pipeline[j],state.pipeline[i]];state.panelDirty=false;invalidateExact();pushHistory();renderPipeline();renderToolPanel();scheduleLivePreview(0)});
  const clear=$('#clearPipeline');if(clear)clear.onclick=()=>{state.pipeline=[];state.panelDirty=false;invalidateExact();pushHistory();renderPipeline();renderToolPanel();scheduleLivePreview(0)};
  const copy=$('#copyApiButton');if(copy)copy.onclick=async()=>{await navigator.clipboard.writeText(apiUrl());showToast('API URL 已复制。')};
}
function renderPipeline(){pipelineCount.textContent=`${state.pipeline.length} 个步骤`;const committed=state.pipeline.map((o,i)=>`<div class="pipeline-chip"><span>${i+1}. ${opName(o.action)} <small>${opSummary(o)}</small></span><button data-chip-remove="${i}">×</button></div>`);let draft=[];if(state.panelDirty&&EFFECT_TOOLS.has(state.activeTool)){try{const ops=opsFromPanel(false);draft=ops.length?[`<div class="pipeline-chip draft"><span>预览中 · ${ops.map(o=>opName(o.action)).join(' + ')}</span></div>`]:[]}catch{}}pipelineChips.innerHTML=committed.length||draft.length?[...committed,...draft].join(''):'<span class="empty-pipeline">参数调整会即时预览；“应用此效果”后加入流程</span>';pipelineChips.querySelectorAll('[data-chip-remove]').forEach(btn=>btn.onclick=()=>{state.pipeline.splice(Number(btn.dataset.chipRemove),1);state.panelDirty=false;invalidateExact();pushHistory();renderPipeline();if(state.activeTool==='pipeline')renderToolPanel();scheduleLivePreview(0)})}

async function serverRender({download=false}={}){if(!state.sourceImage||state.busy)return;try{if(state.panelDirty)commitDraft(true)}catch(e){showToast(e.message,'error');return}setBusy(true);try{let response;if(state.sourceFile){const form=new FormData();form.append('file',state.sourceFile);form.append('pipeline',JSON.stringify(state.pipeline));form.append('format',state.output.format);form.append('quality',String(state.output.quality));if(state.watermarkFile&&state.pipeline.some(o=>o.action==='watermark'&&o.params?.[0]==='__watermark__'))form.append('watermark',state.watermarkFile);response=await fetch('/api',{method:'POST',body:form})}else{response=await fetch('/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:state.sourceUrl,pipeline:state.pipeline,format:state.output.format,quality:state.output.quality})})}if(!response.ok){let message=`处理失败（HTTP ${response.status}）`;try{const data=await response.json();if(data.error)message=data.error}catch{}throw Error(message)}const blob=await response.blob();revoke(state.resultPreview);state.resultBlob=blob;state.resultPreview=URL.createObjectURL(blob);previewImage.onload=()=>{imageDimensions.textContent=`${previewImage.naturalWidth} × ${previewImage.naturalHeight}`};previewImage.src=state.resultPreview;previewImage.hidden=false;previewCanvas.hidden=true;setPreviewMode(true);compareButton.disabled=false;if(download){const ext=state.output.format==='jpg'?'jpg':state.output.format,base=(state.sourceName||'image').replace(/\.[a-z0-9]+$/i,'').replace(/[^\w\u4e00-\u9fff-]+/g,'-'),a=document.createElement('a');a.href=state.resultPreview;a.download=`${base||'image'}-processed.${ext}`;document.body.appendChild(a);a.click();a.remove();showToast(`导出完成 · ${Math.max(1,Math.round(blob.size/1024))} KB`)}else showToast(`精确预览完成 · ${Math.max(1,Math.round(blob.size/1024))} KB`)}catch(e){showToast(e.message||'图片处理失败。','error')}finally{setBusy(false)}}

function showOriginal(){if(!state.sourceImage)return;previewImage.src=state.sourceObjectUrl||state.sourceUrl;previewImage.hidden=false;previewCanvas.hidden=true;compareButton.textContent='正在显示原图'}
function restorePreview(){compareButton.textContent='按住看原图';if(state.exactMode&&state.resultPreview){previewImage.src=state.resultPreview;previewImage.hidden=false;previewCanvas.hidden=true}else{previewImage.hidden=true;previewCanvas.hidden=false;imageDimensions.textContent=`${state.previewLogicalWidth||state.width} × ${state.previewLogicalHeight||state.height}`}}

chooseFileButton.onclick=()=>fileInput.click();
fileInput.onchange=()=>loadLocalFile(fileInput.files[0]);
urlForm.onsubmit=e=>{e.preventDefault();loadRemoteUrl(urlInput.value.trim())};
['dragenter','dragover'].forEach(name=>dropZone.addEventListener(name,e=>{e.preventDefault();dropZone.classList.add('dragging')}));
['dragleave','drop'].forEach(name=>dropZone.addEventListener(name,e=>{e.preventDefault();dropZone.classList.remove('dragging')}));
dropZone.addEventListener('drop',e=>loadLocalFile(e.dataTransfer.files?.[0]));
$$('.tool-button').forEach(btn=>btn.onclick=()=>setTool(btn.dataset.tool));
runButton.onclick=()=>serverRender({download:false});
downloadButton.onclick=()=>serverRender({download:true});
newImageButton.onclick=resetStudio;
undoButton.onclick=undo;
redoButton.onclick=redo;
resetButton.onclick=resetEdits;
fitButton.onclick=()=>{canvasStage.classList.toggle('cover');fitButton.textContent=canvasStage.classList.contains('cover')?'留出边距':'适应窗口'};
compareButton.onpointerdown=showOriginal;compareButton.onpointerup=restorePreview;compareButton.onpointerleave=restorePreview;window.addEventListener('pointerup',restorePreview);
window.addEventListener('keydown',e=>{const tag=e.target?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}});

previewCanvas.hidden=true;previewImage.hidden=true;updateHistoryButtons();updateExport();setPreviewMode(false);
