import * as XLSX from 'xlsx';
import './styles.css';

const STORAGE_KEY = 'local_video_workbench_state_v2';

const pipelineSteps = [
  '文案上传',
  '文案生成音频',
  '匹配视频素材',
  '抓取素材首帧',
  'FunASR 识别字幕',
  '合成标题字幕',
  '导出最终视频',
];

const initialState = {
  activeView: 'audio',
  workMode: 'single',
  activeTaskId: null,
  defaultVoiceId: null,
  batchExportFolderName: '',
  batchCount: 0,
  tasks: [],
  voices: [],
  operationLogs: [],
  previewVideoUrl: '',
  materialInventory: {
    unused: { count: 0, totalDuration: 0, files: [] },
    fragments: { count: 0, totalDuration: 0, files: [] },
    used: { count: 0, totalDuration: 0, files: [] },
    updatedAt: null,
  },
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState;
  try {
    const saved = { ...initialState, ...JSON.parse(raw) };
    const allowedViews = new Set(['audio', 'batch', 'compose', 'materials', 'logs']);
    const activeView = allowedViews.has(saved.activeView) ? saved.activeView : 'audio';
    const workMode = saved.workMode === 'batch' ? 'batch' : 'single';
    const defaultVoiceId = saved.defaultVoiceId || null;
    return {
      ...saved,
      activeView,
      workMode,
      tasks: saved.tasks.map((task) => normalizeTask(task, defaultVoiceId)),
      operationLogs: saved.operationLogs || [],
      materialInventory: saved.materialInventory || initialState.materialInventory,
    };
  } catch {
    return initialState;
  }
}

function normalizeTask(task, fallbackVoiceId = null) {
  return {
    ...task,
    itemNumber: task.itemNumber || `${getTodayKey()}_0001`,
    titleStyle: task.titleStyle || { size: 64, color: '#ffffff', x: 50, y: 18 },
    subtitleStyle: task.subtitleStyle || { size: 42, color: '#ffffff', x: 50, y: 78 },
    selectedVoiceId: task.selectedVoiceId || fallbackVoiceId,
    composeHistory: task.composeHistory || [],
    materialFrameUrl: task.materialFrameUrl || null,
    audioUrl: task.audioUrl || '',
    videoUrl: task.videoUrl || '',
    outputPath: task.outputPath || '',
    titleHold: task.titleHold || '8',
    audioTraceId: task.audioTraceId || '',
    subtitleConfirmed: Boolean(task.subtitleConfirmed),
    statusReason: task.statusReason || '',
  };
}

function addOperationLog(action, detail, level = 'info') {
  const item = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action,
    detail,
    level,
    time: new Date().toISOString(),
  };
  const operationLogs = [item, ...(state.operationLogs || [])].slice(0, 120);
  state = { ...state, operationLogs };
  saveState();
  render();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(nextState) {
  state = { ...state, ...nextState };
  saveState();
  render();
}

async function loadMaterialInventory() {
  try {
    const response = await fetch(`/material_inventory.json?ts=${Date.now()}`);
    if (!response.ok) return;
    const inventory = await response.json();
    setState({ materialInventory: { ...initialState.materialInventory, ...inventory } });
  } catch {
    // Inventory is optional until the local scan script has been run.
  }
}

async function initMaterialFoldersFromUi() {
  try {
    const response = await fetch('http://127.0.0.1:3210/api/materials/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '初始化失败');
    }
    await loadMaterialInventory();
    alert('已在本地完成文件夹创建和素材扫描。');
  } catch (error) {
    alert(`初始化失败：${error.message}\n请确认开发服务使用 npm run dev 启动。`);
  }
}

async function scanMaterialsFromUi(options = {}) {
  const { silent = false } = options;
  try {
    const response = await fetch('http://127.0.0.1:3210/api/materials/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '扫描失败');
    }
    await loadMaterialInventory();
    return { ok: true };
  } catch (error) {
    if (!silent) {
      alert(`扫描失败：${error.message}\n请确认开发服务使用 npm run dev 启动。`);
    }
    return { ok: false, error: error.message };
  }
}
function createBatchId() {
  const next = state.batchCount + 1;
  const day = getTodayKey();
  return `batch_${day}_${String(next).padStart(3, '0')}`;
}

function getTodayKey() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
}

function createTask({ batchId, index, title, body, language = 'yue' }) {
  const sequence = String(index).padStart(4, '0');
  const itemNumber = `${getTodayKey()}_${sequence}`;
  const id = `${batchId}_item_${sequence}`;
  return {
    id,
    itemNumber,
    batchId,
    title: title.trim(),
    body: body.trim(),
    language: language || 'yue',
    titleStyle: {
      size: 64,
      color: '#ffffff',
      x: 50,
      y: 18,
    },
    subtitleStyle: {
      size: 42,
      color: '#ffffff',
      x: 50,
      y: 78,
    },
    status: '待处理',
    stepIndex: 0,
    progress: 0,
    message: '已上传，等待生成音频',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    audioStatus: '未生成',
    videoStatus: '未合成',
    selectedVoiceId: state.defaultVoiceId,
    composeHistory: [],
    materialFrame: null,
    materialFrameUrl: null,
    audioUrl: '',
    videoUrl: '',
    outputPath: '',
    titleHold: '8',
    audioTraceId: '',
    subtitleConfirmed: false,
  };
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function grabMaterialFrame(taskId) {
  try {
    await scanMaterialsFromUi();
    const response = await fetch('http://127.0.0.1:3210/api/materials/first-frame');
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '首帧抓取失败');
    }
    const frameUrl = `${result.url}&t=${Date.now()}`;
    const tasks = state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            materialFrame: result.fileName,
            materialFrameUrl: frameUrl,
            updatedAt: new Date().toISOString(),
          }
        : task,
    );
    setState({ tasks });
  } catch (error) {
    const failedTasks = state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: '失败',
            statusReason: error.message,
            message: `首帧抓取失败：${error.message}`,
            updatedAt: new Date().toISOString(),
          }
        : task,
    );
    setState({ tasks: failedTasks });
    alert(`没有抓取到首帧：${error.message}`);
  }
}

async function rematchMaterial(taskId) {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return;

  const beginTasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          stepIndex: Math.max(task.stepIndex, 2),
          progress: Math.max(task.progress, Math.round((2 / (pipelineSteps.length - 1)) * 100)),
          status: '处理中',
          statusReason: '',
          message: `正在处理：${pipelineSteps[2]}`,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks: beginTasks });
  addOperationLog('重新匹配素材', `#${current.itemNumber} ${current.title}`);

  const scanResult = await scanMaterialsFromUi({ silent: true });
  if (!scanResult.ok) {
    const failedTasks = state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: '失败',
            statusReason: scanResult.error || '素材扫描失败',
            message: `匹配视频素材失败：${scanResult.error || '素材扫描失败'}`,
            updatedAt: new Date().toISOString(),
          }
        : task,
    );
    setState({ tasks: failedTasks });
    addOperationLog('匹配素材失败', `#${current.itemNumber} ${scanResult.error || '素材扫描失败'}`, 'error');
    return;
  }

  try {
    const response = await fetch('http://127.0.0.1:3210/api/materials/first-frame');
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '首帧抓取失败');
    }

    const frameUrl = `${result.url}&t=${Date.now()}`;
    const nextTasks = state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            stepIndex: Math.max(task.stepIndex, 3),
            progress: Math.max(task.progress, Math.round((3 / (pipelineSteps.length - 1)) * 100)),
            status: '处理中',
            statusReason: '',
            message: `正在处理：${pipelineSteps[3]}`,
            materialFrame: result.fileName,
            materialFrameUrl: frameUrl,
            updatedAt: new Date().toISOString(),
          }
        : task,
    );
    setState({ tasks: nextTasks });
    addOperationLog('匹配素材完成', `#${current.itemNumber} ${result.fileName}`);
  } catch (error) {
    const failedTasks = state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: '失败',
            statusReason: error.message,
            message: `匹配视频素材失败：${error.message}`,
            updatedAt: new Date().toISOString(),
          }
        : task,
    );
    setState({ tasks: failedTasks });
    addOperationLog('匹配素材失败', `#${current.itemNumber} ${error.message}`, 'error');
  }
}
function addPasteTask(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const title = String(form.get('title') || '');
  const body = String(form.get('body') || '');
  if (!title.trim() || !body.trim()) {
    alert('每个视频都必须有标题和文案正文。');
    return;
  }

  const batchId = createBatchId();
  const task = createTask({
    batchId,
    index: 1,
    title,
    body,
  });

  setState({
    batchCount: state.batchCount + 1,
    tasks: [task, ...state.tasks],
    activeTaskId: task.id,
    activeView: 'audio',
  });
  addOperationLog('文案上传', `#${task.itemNumber} ${task.title}`);
  event.currentTarget.reset();
}

async function importExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const normalizedRows = rows.map((row) => ({
    title: String(row.title || row.Title || row['标题'] || '').trim(),
    body: String(row.body || row.content || row.text || row['文案'] || row['内容'] || '').trim(),
    language: String(row.language || row.Language || row['语言'] || 'yue').trim() || 'yue',
  }));
  const validRows = normalizedRows.filter((row) => row.title && row.body);

  if (!validRows.length) {
    alert('Excel 需要两列：标题+文案（或 title+body），每行一条。');
    return;
  }

  const batchId = createBatchId();
  const tasks = validRows.map((row, index) =>
    createTask({
      batchId,
      index: index + 1,
      title: row.title,
      body: row.body,
      language: row.language || 'yue',
    }),
  );

  setState({
    batchCount: state.batchCount + 1,
    tasks: [...tasks, ...state.tasks],
    activeTaskId: tasks[0].id,
    activeView: 'audio',
  });
  addOperationLog('Excel导入', `导入 ${tasks.length} 条文案`);
  event.target.value = '';
}

async function importBatchExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const normalizedRows = rows.map((row) => ({
    title: String(row.title || row.Title || row['标题'] || '').trim(),
    body: String(row.body || row.content || row.text || row['文案'] || row['内容'] || '').trim(),
    language: String(row.language || row.Language || row['语言'] || 'yue').trim() || 'yue',
  }));
  const validRows = normalizedRows.filter((row) => row.title && row.body);

  if (!validRows.length) {
    alert('Excel 需要两列：标题+文案（或 title+body），每行一条。');
    return;
  }

  const batchId = createBatchId();
  const tasks = validRows.map((row, index) =>
    createTask({
      batchId,
      index: index + 1,
      title: row.title,
      body: row.body,
      language: row.language || 'yue',
    }),
  );

  setState({
    batchCount: state.batchCount + 1,
    tasks: [...tasks, ...state.tasks],
    activeTaskId: tasks[0].id,
    activeView: 'batch',
    workMode: 'batch',
    batchExportFolderName: `${batchId}_videos`,
  });
  addOperationLog('批量文案导入', `${batchId} / ${tasks.length} 条`);
  event.target.value = '';
}

async function addVoice(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get('voiceName') || '').trim();
  const sampleFile = form.get('voiceSample');
  if (!name) {
    alert('请先给克隆声音起一个名字。');
    return;
  }
  if (!(sampleFile instanceof File) || !sampleFile.size) {
    alert('请上传声音样本（音频或视频）');
    return;
  }

  try {
    const dataBase64 = await fileToBase64(sampleFile);
    const response = await fetch('http://127.0.0.1:3210/api/minimax/clone-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voiceName: name,
        fileName: sampleFile.name,
        mimeType: sampleFile.type || 'application/octet-stream',
        dataBase64,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '克隆失败');
    }

    const voice = {
      id: result.voiceId || `voice_${Date.now()}`,
      name,
      status: '已克隆',
      provider: 'MiniMax 国际版',
      voiceType: 'voice_cloning',
      createdAt: new Date().toISOString(),
      sampleFileName: sampleFile.name || '',
      sampleFileType: sampleFile.type || '',
      sampleFileSize: sampleFile.size || 0,
      demoAudio: result.demoAudio || '',
    };

    setState({
      voices: [voice, ...state.voices],
      defaultVoiceId: state.defaultVoiceId || voice.id,
    });
    addOperationLog('声音克隆成功', `${voice.name} / ${voice.id}`);
    event.currentTarget.reset();
    alert('声音克隆成功');
  } catch (error) {
    addOperationLog('声音克隆失败', error.message, 'error');
    alert(`声音克隆失败：${error.message}`);
  }
}

async function deleteVoice(voiceId) {
  if (!voiceId) return;
  const voice = state.voices.find((item) => item.id === voiceId);
  try {
    const response = await fetch('http://127.0.0.1:3210/api/minimax/delete-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voiceId,
        voiceType: voice?.voiceType || 'voice_cloning',
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '删除失败');
    }

    const voices = state.voices.filter((voice) => voice.id !== voiceId);
    const fallbackVoiceId = voices[0]?.id || null;
    const nextDefaultVoiceId = state.defaultVoiceId === voiceId ? fallbackVoiceId : state.defaultVoiceId;
    const tasks = state.tasks.map((task) => ({
      ...task,
      selectedVoiceId: task.selectedVoiceId === voiceId ? nextDefaultVoiceId : task.selectedVoiceId,
    }));

    setState({
      voices,
      defaultVoiceId: nextDefaultVoiceId,
      tasks,
    });
    addOperationLog('删除声音', `${voiceId} 已同步删除`);
    alert('声音已删除，并已同步到 MiniMax');
  } catch (error) {
    addOperationLog('删除声音失败', `${voiceId} / ${error.message}`, 'error');
    if (confirm(`同步删除失败：${error.message}\n要只在本地移除这条声音吗？`)) {
      const voices = state.voices.filter((item) => item.id !== voiceId);
      const fallbackVoiceId = voices[0]?.id || null;
      const nextDefaultVoiceId = state.defaultVoiceId === voiceId ? fallbackVoiceId : state.defaultVoiceId;
      const tasks = state.tasks.map((task) => ({
        ...task,
        selectedVoiceId: task.selectedVoiceId === voiceId ? nextDefaultVoiceId : task.selectedVoiceId,
      }));
      setState({ voices, defaultVoiceId: nextDefaultVoiceId, tasks });
      addOperationLog('本地移除声音', `${voiceId}（未同步 MiniMax）`, 'error');
      return;
    }
    alert(`删除失败：${error.message}`);
  }
}

function retryTask(taskId) {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return;
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: '待处理',
          statusReason: '',
          message: '已重试，等待处理',
          audioStatus: task.audioStatus === '失败' ? '未生成' : task.audioStatus,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
  addOperationLog('重试任务', `#${current.itemNumber} ${current.title}`);
}

function removeTask(taskId) {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return;
  const tasks = state.tasks.filter((task) => task.id !== taskId);
  const activeTaskId = state.activeTaskId === taskId ? tasks[0]?.id || null : state.activeTaskId;
  setState({ tasks, activeTaskId });
  addOperationLog('删除任务', `#${current.itemNumber} ${current.title}`);
}

function retryFailedAll() {
  const failedTasks = state.tasks.filter((task) => String(task.status).includes('失败'));
  if (!failedTasks.length) return;
  const tasks = state.tasks.map((task) =>
    String(task.status).includes('失败')
      ? {
          ...task,
          status: '待处理',
          statusReason: '',
          message: '已重试，等待处理',
          audioStatus: task.audioStatus === '失败' ? '未生成' : task.audioStatus,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
  addOperationLog('批量重试失败', `${failedTasks.length} 条`);
}

function removeFailedAll() {
  const failedTasks = state.tasks.filter((task) => String(task.status).includes('失败'));
  if (!failedTasks.length) return;
  const failedIds = new Set(failedTasks.map((task) => task.id));
  const tasks = state.tasks.filter((task) => !failedIds.has(task.id));
  const activeTaskId = failedIds.has(state.activeTaskId) ? tasks[0]?.id || null : state.activeTaskId;
  setState({ tasks, activeTaskId });
  addOperationLog('批量删除失败', `${failedTasks.length} 条`, 'error');
}

async function generateAudio(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const voiceId = task.selectedVoiceId || state.defaultVoiceId;
  if (!voiceId) {
    alert('请先在声音克隆页面完成克隆，再回来生成音频');
    return;
  }

  const pendingTasks = state.tasks.map((item) =>
    item.id === taskId
      ? {
          ...item,
          status: '处理中',
          audioStatus: '生成中',
          message: '正在调用 MiniMax 生成音频',
          updatedAt: new Date().toISOString(),
        }
      : item,
  );
  setState({ tasks: pendingTasks });

  try {
    const response = await fetch('http://127.0.0.1:3210/api/minimax/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemNumber: task.itemNumber,
        text: task.body,
        language: task.language || 'yue',
        voiceId,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '音频生成失败');
    }

    const nextTasks = state.tasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            selectedVoiceId: voiceId,
            audioStatus: '已生成',
            audioUrl: `${result.audioUrl}?ts=${Date.now()}`,
            audioTraceId: result.traceId || '',
            stepIndex: Math.max(item.stepIndex, 1),
            progress: Math.max(item.progress, 17),
            status: '待合成',
            statusReason: '',
            message: '音频已生成，等待视频合成',
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    setState({ tasks: nextTasks });
    addOperationLog('生成音频成功', `#${task.itemNumber} 已生成`);
  } catch (error) {
    const failedTasks = state.tasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            status: '失败',
            audioStatus: '失败',
            statusReason: error.message,
            message: `音频生成失败：${error.message}`,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    setState({ tasks: failedTasks });
    addOperationLog('生成音频失败', `#${task.itemNumber} ${error.message}`, 'error');
  }
}

async function advanceTask(taskId) {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return;

  const nextIndex = Math.min(current.stepIndex + 1, pipelineSteps.length - 1);
  if (nextIndex === 2) {
    await rematchMaterial(taskId);
    return;
  }

  const tasks = state.tasks.map((task) => {
    if (task.id !== taskId) return task;
    const targetIndex = Math.min(task.stepIndex + 1, pipelineSteps.length - 1);
    const done = targetIndex === pipelineSteps.length - 1;
    const message = done ? '最终视频已生成，包含标题和字幕' : `正在处理：${pipelineSteps[targetIndex]}`;
    const historyItem = {
      id: `compose_${Date.now()}`,
      time: new Date().toLocaleString('zh-CN'),
      status: done ? '成功' : '处理中',
      message,
      progress: Math.round((targetIndex / (pipelineSteps.length - 1)) * 100),
    };
    return {
      ...task,
      stepIndex: targetIndex,
      status: done ? '成功' : '处理中',
      progress: Math.round((targetIndex / (pipelineSteps.length - 1)) * 100),
      message,
      statusReason: '',
      audioStatus: targetIndex >= 1 ? '已生成' : task.audioStatus,
      videoStatus: done ? '已合成' : task.videoStatus,
      composeHistory: targetIndex >= 2 ? [historyItem, ...(task.composeHistory || [])] : task.composeHistory || [],
      updatedAt: new Date().toISOString(),
    };
  });
  setState({ tasks });
  addOperationLog('处理下一步', `#${current.itemNumber} ${current.title}`);
}

async function composeVideo(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (!task.audioUrl) {
    alert('请先生成音频，再一键合成视频。');
    return;
  }

  const runningTasks = state.tasks.map((item) =>
    item.id === taskId
      ? {
          ...item,
          status: '处理中',
          statusReason: '',
          stepIndex: 2,
          progress: 35,
          message: '正在自动匹配素材并合成视频',
          updatedAt: new Date().toISOString(),
        }
      : item,
  );
  setState({ tasks: runningTasks });

  try {
    const cleanAudioUrl = String(task.audioUrl).split('?')[0];
    const subtitle = String(task.body || '').trim() || '字幕预览文字';
    const response = await fetch('http://127.0.0.1:3210/api/compose/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemNumber: task.itemNumber,
        title: task.title,
        subtitle,
        titleStyle: task.titleStyle,
        subtitleStyle: task.subtitleStyle,
        titleHold: task.titleHold || '8',
        audioUrl: cleanAudioUrl,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '视频合成失败');
    }

    const doneTasks = state.tasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            stepIndex: pipelineSteps.length - 1,
            progress: 100,
            status: '成功',
            videoStatus: '已合成',
            statusReason: '',
            message: `已导出：${result.videoUrl}`,
            videoUrl: `${result.videoUrl}?ts=${Date.now()}`,
            outputPath: result.outputPath || '',
            materialFrame: result.usedMaterial || item.materialFrame,
            materialFrameUrl: result.previewUrl ? `${result.previewUrl}&t=${Date.now()}` : item.materialFrameUrl,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    setState({ tasks: doneTasks });
    await scanMaterialsFromUi({ silent: true });
    addOperationLog('视频合成成功', `#${task.itemNumber} ${result.videoUrl}`);
  } catch (error) {
    const failedTasks = state.tasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            status: '失败',
            statusReason: error.message,
            message: `视频合成失败：${error.message}`,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    setState({ tasks: failedTasks });
    addOperationLog('视频合成失败', `#${task.itemNumber} ${error.message}`, 'error');
  }
}

function getBatchTasks(batchId) {
  return state.tasks.filter((task) => task.batchId === batchId);
}

function applyBatchVoice(batchId, voiceId) {
  if (!batchId) return;
  const tasks = state.tasks.map((task) =>
    task.batchId === batchId
      ? {
          ...task,
          selectedVoiceId: voiceId || task.selectedVoiceId,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks, defaultVoiceId: voiceId || state.defaultVoiceId });
  addOperationLog('批量选择声音', `${batchId} / ${getVoiceName(voiceId)}`);
}

function applyBatchLanguage(batchId, language) {
  if (!batchId) return;
  const tasks = state.tasks.map((task) =>
    task.batchId === batchId
      ? {
          ...task,
          language,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
  addOperationLog('批量选择语言', `${batchId} / ${languageName(language)}`);
}

function confirmBatchSubtitles(batchId) {
  if (!batchId) return;
  const tasks = state.tasks.map((task) =>
    task.batchId === batchId
      ? {
          ...task,
          subtitleConfirmed: true,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
  addOperationLog('批量字幕确认', `${batchId} 已确认`);
}

function applyStyleToBatch(batchId, sourceTaskId) {
  if (!batchId || !sourceTaskId) return;
  const source = state.tasks.find((task) => task.id === sourceTaskId);
  if (!source) return;
  const tasks = state.tasks.map((task) =>
    task.batchId === batchId
      ? {
          ...task,
          titleStyle: { ...source.titleStyle },
          subtitleStyle: { ...source.subtitleStyle },
          titleHold: source.titleHold,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
  addOperationLog('批量套用样式', `${batchId} 已套用`);
}

async function generateBatchAudio(batchId) {
  const tasks = getBatchTasks(batchId);
  for (const task of tasks) {
    if (task.audioStatus === '已生成' && task.audioUrl) continue;
    await generateAudio(task.id);
  }
}

async function generateBatchVideos(batchId) {
  const tasks = getBatchTasks(batchId);
  for (const task of tasks) {
    if (task.videoStatus === '已合成' && task.videoUrl) continue;
    const latest = state.tasks.find((item) => item.id === task.id);
    if (!latest?.audioUrl) continue;
    await composeVideo(task.id);
  }
}

async function startBatchAll(batchId) {
  if (!batchId) return;
  const batchTasks = getBatchTasks(batchId);
  const unchecked = batchTasks.filter((task) => !task.subtitleConfirmed).length;
  if (unchecked > 0) {
    alert(`请先确认标题和字幕样式。还有 ${unchecked} 条未确认。`);
    return;
  }
  addOperationLog('批量开始', `${batchId} 开始自动执行`);
  await generateBatchAudio(batchId);
  await generateBatchVideos(batchId);
  addOperationLog('批量完成', `${batchId} 自动执行结束`);
}
function selectVoice(taskId, voiceId) {
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          selectedVoiceId: voiceId,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks, defaultVoiceId: voiceId || state.defaultVoiceId });
}

function selectLanguage(taskId, language) {
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          language,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
}

function markFailed(taskId) {
  const current = state.tasks.find((task) => task.id === taskId);
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: '失败',
          statusReason: '手动标记失败',
          message: '当前步骤失败，请检查配置、音频或素材库存',
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
  if (current) addOperationLog('手动标记失败', `#${current.itemNumber} ${current.title}`, 'error');
}

function updateTaskStyle(taskId, target, key, value) {
  const tasks = state.tasks.map((task) => {
    if (task.id !== taskId) return task;
    const styleKey = target === 'title' ? 'titleStyle' : 'subtitleStyle';
    const nextValue = key === 'color' ? value : Number(value);
    return {
      ...task,
      [styleKey]: {
        ...task[styleKey],
        [key]: nextValue,
      },
      updatedAt: new Date().toISOString(),
    };
  });
  setState({ tasks });
}

function updateTitleHold(taskId, value) {
  const map = ['4', '6', '8', 'always'];
  const next = map[Math.max(0, Math.min(3, Number(value) || 0))] || '8';
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          titleHold: next,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
}

function startDrag(event, taskId, target) {
  event.preventDefault();
  const board = event.currentTarget.closest('.compose-preview');
  const element = event.currentTarget;
  if (!board) return;
  let lastX = Number(element.dataset.x || 50);
  let lastY = Number(element.dataset.y || 50);
  element.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
    const rect = board.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, ((moveEvent.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(95, Math.max(5, ((moveEvent.clientY - rect.top) / rect.height) * 100));
    lastX = Math.round(x);
    lastY = Math.round(y);
    element.style.left = `${lastX}%`;
    element.style.top = `${lastY}%`;
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    const tasks = state.tasks.map((task) => {
      if (task.id !== taskId) return task;
      const styleKey = target === 'title' ? 'titleStyle' : 'subtitleStyle';
      return {
        ...task,
        [styleKey]: {
          ...task[styleKey],
          x: lastX,
          y: lastY,
        },
        updatedAt: new Date().toISOString(),
      };
    });
    setState({ tasks });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

function selectTask(taskId) {
  setState({ activeTaskId: taskId, activeView: state.activeView || 'audio' });
}

function selectTaskInView(taskId, view) {
  setState({ activeTaskId: taskId, activeView: view });
}

function statusClass(status) {
  const text = String(status || '');
  if (text.includes('成功') || text.includes('已合成') || text.includes('已生成') || text.includes('待合成')) return 'success';
  if (text.includes('失败')) return 'failed';
  if (text.includes('处理') || text.includes('生成中')) return 'running';
  if (text.includes('待')) return 'waiting';
  return 'idle';
}

function formatSeconds(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
}

function render() {
  const activeTask = state.tasks.find((task) => task.id === state.activeTaskId) || state.tasks[0] || null;
  document.querySelector('#app').innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">片</span>
          <div>
            <strong>小片场</strong>
            <small>本地短视频工作台</small>
          </div>
        </div>
        ${renderNav('audio', '音频工作台')}
        ${renderNav('batch', '批量制作')}
        ${renderNav('compose', '视频合成')}
        ${renderNav('materials', '素材库')}
        ${renderNav('logs', '操作记录')}
        <div class="local-note">本地模式。批次号和编号自动生成。</div>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">清晰流程</p>
            <h1>文案上传 → 生成音频 → 合成最终视频</h1>
          </div>
          <div class="service-pills">
            <span>默认样式</span>
            <span>MiniMax</span>
            <span>FunASR</span>
          </div>
        </header>

        ${state.activeView === 'audio' ? renderAudioWorkbench(activeTask) : ''}
        ${state.activeView === 'batch' ? renderBatchWorkbench(activeTask) : ''}
        ${state.activeView === 'compose' ? renderCompose(activeTask) : ''}
        ${state.activeView === 'materials' ? renderMaterials() : ''}
        ${state.activeView === 'logs' ? renderLogsPage() : ''}
      </main>
      ${renderVideoModal()}
    </div>
  `;
  bindEvents();
}

function renderNav(view, label) {
  return `<button class="nav ${state.activeView === view ? 'active' : ''}" data-view="${view}">${label}</button>`;
}

function renderVideoModal() {
  if (!state.previewVideoUrl) return '';
  return `
    <div class="video-modal" data-close-preview="true">
      <div class="video-modal-card" onclick="event.stopPropagation()">
        <div class="panel-heading">
          <h3>视频预览</h3>
          <button class="danger" type="button" data-close-preview="true">关闭</button>
        </div>
        <video controls autoplay src="${state.previewVideoUrl}" style="width:100%;border-radius:12px;"></video>
      </div>
    </div>
  `;
}

function renderAudioWorkbench(activeTask) {
  const taskOptions = state.tasks.map((task) =>
    `<option value="${task.id}" ${activeTask?.id === task.id ? 'selected' : ''}>#${task.itemNumber} ${escapeHtml(task.title)}</option>`,
  ).join('');
  const voiceOptions = state.voices.map((voice) =>
    `<option value="${voice.id}" ${activeTask?.selectedVoiceId === voice.id ? 'selected' : ''}>${escapeHtml(voice.name)}</option>`,
  ).join('');
  return `
    <section class="audio-shell">
      <div class="audio-left">
        <section class="panel">
          <p class="eyebrow">第一步</p>
          <h2>上传文案</h2>
          <div class="material-actions">
            <button class="${state.workMode === 'single' ? 'primary' : 'soft'}" data-work-mode="single" type="button">单条输入</button>
            <button class="${state.workMode === 'batch' ? 'primary' : 'soft'}" data-work-mode="batch" type="button">Excel导入</button>
          </div>
          ${state.workMode === 'single' ? `
            <form id="pasteForm" class="compact-form">
              <label>标题<input name="title" placeholder="输入标题" /></label>
              <label>文案<textarea name="body" placeholder="输入文案"></textarea></label>
              <button class="primary" type="submit">上传</button>
            </form>
          ` : `
            <label class="upload-box">
              <input id="excelInput" type="file" accept=".xlsx,.xls,.csv" />
              <span>选择 Excel（标题+文案）</span>
            </label>
          `}
        </section>

        <section class="panel">
          <p class="eyebrow">第二步</p>
          <h2>声音克隆</h2>
          <details class="compact-fold">
            <summary>展开/收起声音克隆</summary>
            <form id="voiceForm" class="compact-form">
              <label>声音名称<input name="voiceName" placeholder="例如：谢昆" /></label>
              <label>声音样本<input name="voiceSample" type="file" /></label>
              <button class="primary" type="submit">克隆</button>
            </form>
          </details>
          <div class="voice-mini-list">
            ${state.voices.length ? state.voices.map((voice) => `
              <div class="voice-mini-row">
                <span>${escapeHtml(voice.name)} / ${escapeHtml(voice.id)}</span>
                <button class="danger" data-delete-voice="${voice.id}" type="button">删</button>
              </div>
            `).join('') : '<small>暂无克隆声音</small>'}
          </div>
        </section>

        <section class="panel">
          <p class="eyebrow">第三步</p>
          <h2>生成音频</h2>
          ${state.tasks.length ? `
            <div class="compact-audio-grid">
              <div>
                <label>选择文案
                  <select data-select-task="audio">${taskOptions}</select>
                </label>
                <label>选择声音
                  <select data-voice-task="${activeTask?.id || ''}">
                    <option value="">默认声音</option>
                    ${voiceOptions}
                  </select>
                </label>
                <label>语言
                  <select data-language-task="${activeTask?.id || ''}">
                    <option value="yue" ${activeTask?.language === 'yue' ? 'selected' : ''}>粤语</option>
                    <option value="mandarin" ${activeTask?.language === 'mandarin' ? 'selected' : ''}>普通话</option>
                    <option value="english" ${activeTask?.language === 'english' ? 'selected' : ''}>英语</option>
                  </select>
                </label>
                <button class="primary" data-generate-audio="${activeTask?.id || ''}" type="button">生成音频</button>
              </div>
              <div class="audio-status-box">
                <strong>音频状态：${activeTask?.audioStatus || '-'}</strong>
                <small>任务：${activeTask ? `#${activeTask.itemNumber}` : '-'}</small>
                ${activeTask?.audioUrl ? `<audio controls src="${activeTask.audioUrl}" style="width:100%;margin-top:8px;"></audio>` : ''}
                ${activeTask?.statusReason ? `<small class="log-error-text">原因：${escapeHtml(activeTask.statusReason)}</small>` : ''}
              </div>
            </div>
          ` : renderEmpty('先上传文案')}
        </section>
      </div>
      <div class="audio-right">
        ${renderTaskBoard(activeTask)}
      </div>
    </section>
  `;
}

function renderTaskBoard(activeTask) {
  const tasks = state.tasks || [];
  const doneAudio = tasks.filter((task) => task.audioStatus === '已生成');
  const pendingAudio = tasks.filter((task) => task.audioStatus !== '已生成');
  const failedCount = tasks.filter((task) => String(task.status).includes('失败')).length;
  const renderRows = (rows) => rows.map((task) => `
    <div class="record-row task-record-row ${activeTask?.id === task.id ? 'selected' : ''}" data-pick-task="${task.id}" data-pick-view="audio" role="button" tabindex="0">
      <span class="status ${statusClass(task.status)}">${task.status}</span>
      <span>#${task.itemNumber}</span>
      <span>${escapeHtml(task.title)}</span>
      <span>${task.audioStatus}</span>
      <span>${task.videoStatus}</span>
      <span>${task.statusReason ? escapeHtml(task.statusReason) : ''}</span>
      ${String(task.status).includes('失败') ? `
        <span class="row-actions">
          <button class="soft" type="button" data-retry-task="${task.id}">重试</button>
          <button class="danger" type="button" data-remove-task="${task.id}">删除</button>
        </span>
      ` : '<span></span>'}
    </div>
  `).join('');
  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">任务看板</p>
          <h2>点击可预览</h2>
        </div>
        <div class="material-actions">
          <button class="soft" data-retry-failed-all="true" type="button">重试失败(${failedCount})</button>
          <button class="danger" data-remove-failed-all="true" type="button">删除失败</button>
        </div>
      </div>
      ${activeTask ? `
        <div class="audio-status-box">
          <strong>#${activeTask.itemNumber} ${escapeHtml(activeTask.title)}</strong>
          ${activeTask.audioUrl ? `<audio controls src="${activeTask.audioUrl}" style="width:100%;margin-top:8px;"></audio>` : ''}
        </div>
      ` : ''}
      <div class="record-table">
        <div class="record-head audio-task-head">
          <span>状态</span><span>编号</span><span>标题</span><span>音频</span><span>合成</span><span>原因</span><span>操作</span>
        </div>
        <div class="task-group-title">已转音频</div>
        ${doneAudio.length ? renderRows(doneAudio) : renderEmpty('暂无已转音频文案')}
        <div class="task-group-title">未转音频</div>
        ${pendingAudio.length ? renderRows(pendingAudio) : renderEmpty('暂无未转音频文案')}
      </div>
    </section>
  `;
}

function renderBatchWorkbench(activeTask) {
  const batchIds = [...new Set(state.tasks.map((task) => task.batchId).filter(Boolean))];
  const batchActiveTask = activeTask || (batchIds.length ? getBatchTasks(batchIds[0])[0] : null);
  const activeBatchId = batchActiveTask?.batchId || batchIds[0] || '';
  const batchTasks = getBatchTasks(activeBatchId);
  const doneAudio = batchTasks.filter((task) => task.audioStatus === '已生成').length;
  const doneVideo = batchTasks.filter((task) => task.videoStatus === '已合成').length;
  const confirmedCount = batchTasks.filter((task) => task.subtitleConfirmed).length;
  const voiceOptions = state.voices.map((voice) =>
    `<option value="${voice.id}" ${batchActiveTask?.selectedVoiceId === voice.id ? 'selected' : ''}>${escapeHtml(voice.name)}</option>`,
  ).join('');
  const rows = batchTasks.map((task) => `
    <button class="batch-simple-row ${activeTask?.id === task.id ? 'selected' : ''}" data-pick-task="${task.id}" data-pick-view="batch" type="button">
      <span class="status ${statusClass(task.status)}">${task.status}</span>
      <strong>#${task.itemNumber} ${escapeHtml(task.title)}</strong>
      <span>音频：${task.audioStatus}</span>
      <span>字幕：${task.subtitleConfirmed ? '已确认' : '待确认'}</span>
      <span>视频：${task.videoStatus}</span>
      <span class="batch-reason">${task.statusReason ? escapeHtml(task.statusReason) : '无异常'}</span>
    </button>
  `).join('');
  return `
    <section class="batch-shell">
      <div class="panel batch-list-panel">
        <p class="eyebrow">批量制作</p>
        <h2>上传批量文案后，确认样式，一键自动跑完</h2>
        <label class="upload-box">
          <input id="batchExcelInput" type="file" accept=".xlsx,.xls,.csv" />
          <span>上传批量文案 Excel</span>
        </label>
        ${batchIds.length ? `
          <div class="batch-form-grid">
            <label>选择批次
              <select data-select-batch="true">
                ${batchIds.map((batchId) => `<option value="${batchId}" ${batchId === activeBatchId ? 'selected' : ''}>${batchId}（${getBatchTasks(batchId).length}条）</option>`).join('')}
              </select>
            </label>
            <label>批量声音
              <select data-batch-voice="${activeBatchId}">
                <option value="">默认声音</option>
                ${voiceOptions}
              </select>
            </label>
            <label>批量语言
              <select data-batch-language="${activeBatchId}">
                <option value="yue" ${batchActiveTask?.language === 'yue' ? 'selected' : ''}>粤语</option>
                <option value="mandarin" ${batchActiveTask?.language === 'mandarin' ? 'selected' : ''}>普通话</option>
                <option value="english" ${batchActiveTask?.language === 'english' ? 'selected' : ''}>英语</option>
              </select>
            </label>
            <label>桌面文件夹名称
              <input data-batch-folder type="text" value="${escapeHtml(state.batchExportFolderName || `${activeBatchId}_videos`)}" />
            </label>
          </div>
          <div class="batch-stats">
            <div><span>总数</span><strong>${batchTasks.length}</strong></div>
            <div><span>音频</span><strong>${doneAudio}/${batchTasks.length}</strong></div>
            <div><span>字幕确认</span><strong>${confirmedCount}/${batchTasks.length}</strong></div>
            <div><span>导出</span><strong>${doneVideo}/${batchTasks.length}</strong></div>
          </div>
          <div class="material-actions">
            <button class="soft" type="button" data-apply-batch-style="${activeBatchId}" data-style-source="${batchActiveTask?.id || ''}">套用当前标题/字幕样式</button>
            <button class="soft" type="button" data-confirm-batch-subtitles="${activeBatchId}">确认标题和字幕样式</button>
            <button class="primary" type="button" data-start-batch-all="${activeBatchId}">一键开始：生成音频并导出</button>
          </div>
          <div class="batch-simple-list">
            ${rows || renderEmpty('当前批次没有文案')}
          </div>
        ` : renderEmpty('先上传批量文案 Excel')}
      </div>
      <div class="panel">
        <p class="eyebrow">字幕和标题预览</p>
        <h2>先点左侧任务，确认字幕位置和标题时长</h2>
        ${batchActiveTask ? renderComposePreview(batchActiveTask) : renderEmpty('先导入批量文案')}
      </div>
    </section>
  `;
}

function renderOperationLogs() {
  const logs = state.operationLogs || [];
  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">操作记录</p>
          <h2>每次操作都会留痕，不会丢</h2>
        </div>
      </div>
      <div class="record-list operation-log-list">
        ${logs.length ? logs.map((log) => `
          <article class="log-${log.level}">
            <strong>${escapeHtml(log.action)}</strong>
            <small>${escapeHtml(log.detail)} / ${formatTime(log.time)}</small>
          </article>
        `).join('') : renderEmpty('暂无操作记录')}
      </div>
    </section>
  `;
}

function renderLogsPage() {
  return renderOperationLogs();
}

function renderOverview(activeTask) {
  return `
    <section class="flow-strip">
      ${renderFlowStep('1', '文案上传', '复制粘贴或 Excel 上传。每条必须有标题和正文。')}
      ${renderFlowStep('2', '文案生成音频', 'MiniMax 用默认粤语生成配音。')}
      ${renderFlowStep('3', '音频结合视频', '匹配未使用素材，生成带标题和字幕的视频。')}
    </section>
    <section class="dashboard-grid">
      <div class="panel task-list">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">批次任务</p>
            <h2>每条记录都有批次号和编号</h2>
          </div>
          <button class="primary" data-view="upload">上传文案</button>
        </div>
        ${state.tasks.length ? state.tasks.map(renderTaskRow).join('') : renderEmpty('还没有文案任务，先上传一条。')}
      </div>
      <div class="panel detail-panel">
        ${activeTask ? renderTaskDetail(activeTask) : renderEmpty('选择一条任务后，这里会显示标题、文案、音频和视频进度。')}
      </div>
    </section>
  `;
}

function renderFlowStep(number, title, text) {
  return `
    <article class="flow-step">
      <span>${number}</span>
      <strong>${title}</strong>
      <small>${text}</small>
    </article>
  `;
}

function renderTaskRow(task) {
  return `
    <button class="task-row ${state.activeTaskId === task.id ? 'selected' : ''}" data-task="${task.id}">
      <span>
        <strong>${escapeHtml(task.title)}</strong>
        <small>批次 ${task.batchId} / 编号 ${task.itemNumber}</small>
      </span>
      <span class="status ${statusClass(task.status)}">${task.status}</span>
    </button>
  `;
}

function renderTaskDetail(task) {
  return `
    <div class="detail-header">
      <div>
        <p class="eyebrow">当前任务</p>
        <h2>${escapeHtml(task.title)}</h2>
        <small>批次号：${task.batchId}　编号：${task.itemNumber}</small>
      </div>
      <span class="status ${statusClass(task.status)}">${task.status}</span>
    </div>
    <div class="progress-card">
      <div class="progress-copy">
        <strong>${escapeHtml(task.message)}</strong>
        <small>当前步骤：${pipelineSteps[task.stepIndex]}</small>
      </div>
      <div class="progress-track"><span style="width:${task.progress}%"></span></div>
      <small>${task.progress}%</small>
    </div>
    <div class="asset-grid">
      <div><span>标题</span><strong>${escapeHtml(task.title)}</strong></div>
      <div><span>音频</span><strong>${task.audioStatus}</strong></div>
      <div><span>视频</span><strong>${task.videoStatus}</strong></div>
      <div><span>语言</span><strong>${languageName(task.language)}</strong></div>
    </div>
    <div class="preview-card">
      <div class="frame-box">
        <span>准备使用素材首帧</span>
        <small>${task.materialFrame || '匹配素材后自动抓取'}</small>
      </div>
      <div class="copy-box">
        <span>文案正文</span>
        <p>${escapeHtml(task.body)}</p>
      </div>
    </div>
    <div class="actions">
      <button class="primary" data-advance="${task.id}">处理下一步</button>
      <button class="soft" data-view="audio">去生成音频</button>
      <button class="soft" data-view="compose">去视频合成</button>
      <button class="danger" data-fail="${task.id}">标记失败</button>
    </div>
  `;
}

function renderUpload(mode = 'single') {
  const nextBatch = createBatchId();
  if (mode === 'batch') {
    return `
      <section class="panel">
        <p class="eyebrow">批量上传</p>
        <h2>一行就是一个视频（支持批量）</h2>
        <p class="hint">支持两列：标题+文案，或 title+body。</p>
        <div class="excel-sample">
          <span>title</span><span>body</span>
          <strong>今天的小确幸</strong><strong>这里放文案正文</strong>
        </div>
        <label class="upload-box">
          <input id="excelInput" type="file" accept=".xlsx,.xls,.csv" />
          <span>选择本地 Excel 文件</span>
        </label>
      </section>
    `;
  }
  return `
    <section class="two-column">
      <form class="panel import-form" id="pasteForm">
        <p class="eyebrow">第一步：文案上传</p>
        <h2>标题和文案一起生成任务</h2>
        <div class="number-preview">
          <span>即将生成批次号</span>
          <strong>${nextBatch}</strong>
          <small>复制粘贴会生成日期编号 ${getTodayKey()}_0001；Excel 每一行自动生成 ${getTodayKey()}_0001、${getTodayKey()}_0002...</small>
        </div>
        <label>视频标题<input name="title" placeholder="每个视频都需要标题" /></label>
        <label>文案正文<textarea name="body" placeholder="粘贴要生成音频的文案"></textarea></label>
        <p class="hint">语言在“生成音频”里选择。标题和字幕样式在“视频合成”里调整。</p>
        <button class="primary" type="submit">生成文案任务</button>
      </form>
      <div class="panel">
        <p class="eyebrow">说明</p>
        <h2>先做单条，确认后再批量</h2>
        <p class="hint">你现在是单条模式。右上切到“批量导入”再传 Excel。</p>
      </div>
    </section>
  `;
}

function renderVoice() {
  const formBlock = `
      <form class="panel" id="voiceForm">
        <p class="eyebrow">第二步前置：声音克隆</p>
        <h2>MiniMax 国际版声音克隆</h2>
        <p class="hint">上传样本后会实时调用 MiniMax 进行声音克隆并返回 voice_id。</p>
        <label>声音名称<input name="voiceName" placeholder="例如：我的粤语女声" /></label>
        <label>声音样本<input name="voiceSample" type="file" /></label>
        <p class="hint">支持上传音频或视频文件，尽量不限制格式。</p>
        <button class="primary" type="submit">登记克隆声音</button>
      </form>
  `;
  return `
    <section class="two-column">
      ${state.voices.length ? `
        <details class="panel" id="voiceFold">
          <summary>新增声音克隆</summary>
          ${formBlock}
        </details>
      ` : formBlock}
      <div class="panel">
        <p class="eyebrow">声音列表</p>
        <h2>后续生成音频时选择</h2>
        ${state.voices.length ? state.voices.map((voice) => `
          <article class="voice-card">
            <strong>${escapeHtml(voice.name)}</strong>
            <span class="status waiting">${voice.status}</span>
            <small>${voice.provider}</small>
            <small>voice_id：${escapeHtml(voice.id)}</small>
            <small>${voice.sampleFileName ? `样本：${escapeHtml(voice.sampleFileName)}` : '样本：未上传'}</small>
            <button class="danger" data-delete-voice="${voice.id}" type="button">删除</button>
          </article>
        `).join('') : renderEmpty('还没有声音。可以先登记名称，后面接 MiniMax。')}
      </div>
    </section>
  `;
}

function renderAudio(activeTask) {
  return `
    <section class="dashboard-grid">
      <div class="panel">
        <p class="eyebrow">第二步：选择文案</p>
        <h2>先选要生成音频的文案</h2>
        ${renderTaskPicker('audio', state.tasks, activeTask, '还没有文案记录，先去文案上传。')}
      </div>
      <div class="panel">
        <p class="eyebrow">生成音频</p>
        <h2>选择声音后生成配音</h2>
        ${activeTask ? `
          <div class="task-summary">
            <span>当前文案</span>
            <strong>${escapeHtml(activeTask.title)}</strong>
            <small>批次 ${activeTask.batchId} / 编号 ${activeTask.itemNumber}</small>
          </div>
          <label>选择声音
            <select data-voice-task="${activeTask.id}">
              <option value="">使用默认声音</option>
              ${state.voices.map((voice) => `
                <option value="${voice.id}" ${activeTask.selectedVoiceId === voice.id ? 'selected' : ''}>${escapeHtml(voice.name)}</option>
              `).join('')}
            </select>
          </label>
          <label>选择语言
            <select data-language-task="${activeTask.id}">
              <option value="yue" ${activeTask.language === 'yue' ? 'selected' : ''}>粤语</option>
              <option value="mandarin" ${activeTask.language === 'mandarin' ? 'selected' : ''}>普通话</option>
              <option value="english" ${activeTask.language === 'english' ? 'selected' : ''}>英语</option>
            </select>
          </label>
          <p class="hint">${state.voices.length ? '默认按粤语生成，点击就会调用 MiniMax 真正出音频。' : '先在声音克隆页完成克隆。'}</p>
          <button class="primary" data-generate-audio="${activeTask.id}">生成音频</button>
        ` : renderEmpty('请先上传文案。')}
      </div>
      <div class="panel audio-result-panel">
        <p class="eyebrow">音频状态</p>
        <h2>不在这里显示复杂进度</h2>
        ${activeTask ? `
          <div class="asset-grid compact-assets">
            <div><span>音频</span><strong>${activeTask.audioStatus}</strong></div>
            <div><span>当前声音</span><strong>${escapeHtml(getVoiceName(activeTask.selectedVoiceId))}</strong></div>
            <div><span>语言</span><strong>${languageName(activeTask.language)}</strong></div>
          </div>
          ${activeTask.audioUrl ? `<audio controls src="${activeTask.audioUrl}" style="margin-top:12px;width:100%;"></audio>` : ''}
        ` : renderEmpty('暂无任务')}
      </div>
    </section>
  `;
}

function renderCompose(activeTask) {
  const audioTasks = state.tasks.filter((task) => task.audioStatus === '已生成');
  const composeTask = audioTasks.find((task) => task.id === activeTask?.id) || audioTasks[0] || null;
  const options = audioTasks.map((task) =>
    `<option value="${task.id}" ${composeTask?.id === task.id ? 'selected' : ''}>#${task.itemNumber} ${escapeHtml(task.title)}</option>`,
  ).join('');
  return `
    <section class="compose-main-right">
      <div class="panel compose-mid-panel">
        <p class="eyebrow">视频合成</p>
        <h2>中间操作区</h2>
        ${composeTask ? `
          <label>选择音频
            <select data-select-task="compose">
              ${options}
            </select>
          </label>
          <div class="compact-status-line">
            <strong>${composeTask.status}</strong>            
          </div>
          <p class="hint">选好音频后直接点“一键自动合成”，自动匹配素材并导出成片。</p>
          <button class="primary" data-compose-video="${composeTask.id}">一键自动合成</button>
          <button class="soft" data-rematch-material="${composeTask.id}">仅重匹配素材</button>
          <button class="soft" data-grab-frame="${composeTask.id}">仅抓首帧</button>
          <button class="soft" data-retry-task="${composeTask.id}">重试</button>
          <button class="danger" data-remove-task="${composeTask.id}">删除</button>
          <button class="soft" data-view="materials">素材库</button>
        ` : renderEmpty('请先上传文案并生成音频。')}
        ${renderComposePreview(composeTask)}
      </div>
      <details class="panel compose-right-panel" open>
        <summary>合成记录（可折叠）</summary>
        ${renderInlineComposeRecords(composeTask)}
      </details>
    </section>
  `;
}
function renderComposeProgress(task) {
  return `
    <div class="progress-card compose-progress">
      <div class="progress-copy">
        <strong>${escapeHtml(task.message)}</strong>
        <small>${task.status}</small>
      </div>
      <div class="progress-track"><span style="width:${task.progress}%"></span></div>
      <small>${task.progress}% / 当前步骤：${pipelineSteps[task.stepIndex]}</small>
    </div>
  `;
}

function renderTaskPicker(view, tasks, activeTask, emptyText) {
  return `
    <div class="picker-list">
      ${tasks.length ? tasks.map((task) => `
        <button class="picker-row ${activeTask?.id === task.id ? 'selected' : ''}" data-pick-task="${task.id}" data-pick-view="${view}">
          <span>
            <strong>${escapeHtml(task.title)}</strong>
            <small>${task.batchId} / ${task.itemNumber}</small>
          </span>
          <span class="status ${statusClass(task.status)}">${view === 'audio' ? task.status : '可合成'}</span>
        </button>
      `).join('') : renderEmpty(emptyText)}
    </div>
  `;
}

function renderInlineComposeRecords(activeTask) {
  const composeTasks = state.tasks.filter((task) => task.audioStatus === '已生成');
  const totalDone = composeTasks.filter((task) => task.videoStatus === '已合成' || String(task.status).includes('成功')).length;
  const running = composeTasks.filter((task) => String(task.status).includes('处理')).length;
  const pending = composeTasks.filter((task) => String(task.status).includes('待')).length;
  const recent = composeTasks.slice(0, 30);
  return `
    <div class="mini-stats">
      <div><span>已完成</span><strong>${totalDone}</strong></div>
      <div><span>处理中</span><strong>${running}</strong></div>
      <div><span>待处理</span><strong>${pending}</strong></div>
    </div>
    <div class="record-table compose-record-table">
      <div class="record-head compose-record-head">
        <span>编号</span>
        <span>标题</span>
        <span>状态</span>
        <span>当前步骤</span>
        <span>音频</span>
        <span>成片</span>
        <span>原因/说明</span>
        <span>操作</span>
        <span>更新时间</span>
      </div>
      ${recent.length ? recent.map((task) => `
        <div class="record-row compose-record-row ${activeTask?.id === task.id ? 'selected' : ''}" data-pick-task="${task.id}" data-pick-view="compose" role="button" tabindex="0">
          <span>${task.itemNumber}</span>
          <span>${escapeHtml(task.title)}</span>
          <span class="status ${statusClass(task.status)}">${task.status}</span>
          <span>${escapeHtml(pipelineSteps[task.stepIndex] || '-')}</span>
          <span>${task.audioStatus}</span>
          <span>${task.videoUrl ? '已导出' : task.videoStatus}</span>
          <span>${task.statusReason ? escapeHtml(task.statusReason) : ''}</span>
          <span class="row-actions">
            ${task.videoUrl ? `
              <button class="soft" type="button" data-stop-row="true" data-preview-video="${task.videoUrl}">预览</button>
              <a class="soft" data-stop-row="true" href="${task.videoUrl}" download>下载</a>
            ` : ''}
          </span>
          <span>${formatTime(task.updatedAt)}</span>
        </div>
      `).join('') : renderEmpty('暂无输出记录')}
    </div>
  `;
}
function renderComposePreview(task) {
  if (!task) {
    return `
      <div class="compose-preview-empty">
        <span>暂无任务</span>
      </div>
    `;
  }

  return `
    <div class="preview-workbench">
      <div class="compose-preview">
        ${task.materialFrameUrl ? `<video class="preview-video" data-frame-video="${task.id}" src="${task.materialFrameUrl}" muted playsinline preload="metadata"></video>` : ''}
        <button
          class="preview-title"
          data-drag-target="title"
          data-drag-task="${task.id}"
          data-x="${task.titleStyle.x}"
          data-y="${task.titleStyle.y}"
          style="left:${task.titleStyle.x}%; top:${task.titleStyle.y}%; color:${task.titleStyle.color}; font-size:${task.titleStyle.size}px;"
        >${escapeHtml(task.title)}</button>
        <button
          class="preview-subtitle"
          data-drag-target="subtitle"
          data-drag-task="${task.id}"
          data-x="${task.subtitleStyle.x}"
          data-y="${task.subtitleStyle.y}"
          style="left:${task.subtitleStyle.x}%; top:${task.subtitleStyle.y}%; color:${task.subtitleStyle.color}; font-size:${task.subtitleStyle.size}px;"
        >${escapeHtml(String(task.body || '字幕预览文字').split(/[。！？!?]/)[0] || '字幕预览文字')}</button>
      </div>
      <div>
        <div class="style-grid">
          ${renderStyleControl(task, 'title', '标题', task.titleStyle)}
          ${renderStyleControl(task, 'subtitle', '字幕', task.subtitleStyle)}
        </div>
        <p class="hint">可拖动，也可用滑杆微调。</p>
      </div>
    </div>
  `;
}

function renderStyleControl(task, target, label, style) {
  const holdMarks = ['4', '6', '8', 'always'];
  const holdIndex = Math.max(0, holdMarks.indexOf(task.titleHold || '8'));
  return `
    <div class="style-card">
      <h3>${label}调整</h3>
      <label>颜色<input type="color" value="${style.color}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="color" /></label>
      <label>大小<input type="range" min="18" max="96" value="${style.size}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="size" /></label>
      <label>左右位置<input type="range" min="5" max="95" value="${style.x}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="x" /></label>
      <label>上下位置<input type="range" min="5" max="95" value="${style.y}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="y" /></label>
      ${target === 'title' ? `
        <label>标题保留时长
          <input type="range" min="0" max="3" step="1" value="${holdIndex}" data-title-hold-task="${task.id}" />
          <small>${task.titleHold === 'always' ? '一直显示' : `${task.titleHold}s`}</small>
        </label>
      ` : ''}
    </div>
  `;
}

function renderMaterials() {
  const inventory = state.materialInventory || initialState.materialInventory;
  return `
    <section class="materials-layout">
      <div class="panel material-form">
        <p class="eyebrow">素材库</p>
        <h2>按文件夹自动抓取</h2>
        <p class="warning">硬规则：已经使用的视频素材绝对不复用。</p>
        <div class="folder-list">
          <div><span>未用素材</span><strong>local_materials/unused</strong></div>
          <div><span>残片素材</span><strong>local_materials/fragments</strong></div>
          <div><span>已用素材</span><strong>local_materials/used</strong></div>
        </div>
        <p class="hint">你不用特别命名素材，保存进对应文件夹即可。后续程序只从“未用素材”自动抓取。</p>
        <div class="material-actions">
          <button class="primary" data-refresh-materials="true">刷新素材统计</button>
          <button class="soft" data-init-materials="true">一键创建并扫描</button>
        </div>
        <code class="command-code">本地一键执行，不需要复制命令</code>
        <small class="scan-time">最近扫描：${inventory.updatedAt || '尚未扫描'}</small>
      </div>
      <div class="material-columns">
        ${renderInventoryColumn('素材可用', 'unused', inventory.unused)}
        ${renderInventoryColumn('素材残片', 'fragments', inventory.fragments)}
        ${renderInventoryColumn('素材已用', 'used', inventory.used)}
      </div>
    </section>
  `;
}

function renderInventoryColumn(title, kind, bucket = { count: 0, totalDuration: 0, files: [] }) {
  return `
    <div class="panel material-column">
      <h3>${title}</h3>
      <div class="material-summary">
        <div><span>文件数</span><strong>${bucket.count || 0}</strong></div>
        <div><span>分类时长</span><strong>${bucket.totalDuration ? formatSeconds(bucket.totalDuration) : '00:00'}</strong></div>
      </div>
      ${(bucket.files || []).length ? bucket.files.map((file, index) => `
        <article class="material-card">
          <strong>${String(index + 1).padStart(2, '0')}｜${escapeHtml(file.name)}</strong>
          <small>${kind === 'used' ? '已用时长' : kind === 'fragments' ? '残片时长' : '可用时长'}：${file.duration ? formatSeconds(file.duration) : '00:00'}</small>
        </article>
      `).join('') : renderEmpty('暂无素材')}
    </div>
  `;
}

function renderMaterialColumn(title, items) {
  return `
    <div class="panel material-column">
      <h3>${title}</h3>
      ${items.length ? items.map(renderMaterialCard).join('') : renderEmpty('暂无素材')}
    </div>
  `;
}

function renderMaterialCard(item) {
  return `
    <article class="material-card">
      <strong>${escapeHtml(item.name)}</strong>
      <small>${escapeHtml(item.category)}</small>
      <div class="material-times">
        <span>总时长 ${formatSeconds(item.totalDuration)}</span>
        <span>已用 ${formatSeconds(item.usedDuration)}</span>
        <span>剩余 ${formatSeconds(item.remainingDuration)}</span>
      </div>
    </article>
  `;
}

function renderExports() {
  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">导出记录</p>
          <h2>成功、失败、处理中、待处理都看清楚</h2>
        </div>
      </div>
      <div class="record-table">
        <div class="record-head">
          <span>批次号</span><span>编号</span><span>标题</span><span>状态</span><span>说明</span>
        </div>
        ${
          state.tasks.length
            ? state.tasks.map((task) => `
              <div class="record-row">
                <span>${task.batchId}</span>
                <span>${task.itemNumber}</span>
                <span>${escapeHtml(task.title)}</span>
                <span class="status ${statusClass(task.status)}">${task.status}</span>
                <span>${escapeHtml(task.message)}</span>
              </div>
            `).join('')
            : renderEmpty('还没有导出记录')
        }
      </div>
    </section>
  `;
}

function renderEmpty(text) {
  return `<div class="empty">${text}</div>`;
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setState({ activeView: button.dataset.view }));
  });
  document.querySelectorAll('[data-task]').forEach((button) => {
    button.addEventListener('click', () => selectTask(button.dataset.task));
  });
  document.querySelectorAll('[data-pick-task]').forEach((button) => {
    button.addEventListener('click', () => selectTaskInView(button.dataset.pickTask, button.dataset.pickView));
  });
  document.querySelectorAll('[data-select-task]').forEach((select) => {
    select.addEventListener('change', () => selectTaskInView(select.value, select.dataset.selectTask || state.activeView));
  });
  document.querySelectorAll('[data-preview-video]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      setState({ previewVideoUrl: button.dataset.previewVideo || '' });
    });
  });
  document.querySelectorAll('[data-stop-row]').forEach((node) => {
    node.addEventListener('click', (event) => event.stopPropagation());
  });
  document.querySelectorAll('[data-close-preview]').forEach((button) => {
    button.addEventListener('click', () => setState({ previewVideoUrl: '' }));
  });
  document.querySelectorAll('[data-advance]').forEach((button) => {
    button.addEventListener('click', () => advanceTask(button.dataset.advance));
  });
  document.querySelectorAll('[data-compose-video]').forEach((button) => {
    button.addEventListener('click', () => composeVideo(button.dataset.composeVideo));
  });
  document.querySelectorAll('[data-generate-audio]').forEach((button) => {
    button.addEventListener('click', () => generateAudio(button.dataset.generateAudio));
  });
  document.querySelectorAll('[data-grab-frame]').forEach((button) => {
    button.addEventListener('click', () => grabMaterialFrame(button.dataset.grabFrame));
  });
  document.querySelectorAll('[data-rematch-material]').forEach((button) => {
    button.addEventListener('click', () => rematchMaterial(button.dataset.rematchMaterial));
  });
  document.querySelectorAll('[data-fail]').forEach((button) => {
    button.addEventListener('click', () => markFailed(button.dataset.fail));
  });
  document.querySelectorAll('[data-retry-task]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      retryTask(button.dataset.retryTask);
    });
  });
  document.querySelectorAll('[data-remove-task]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      removeTask(button.dataset.removeTask);
    });
  });
  document.querySelector('[data-retry-failed-all]')?.addEventListener('click', retryFailedAll);
  document.querySelector('[data-remove-failed-all]')?.addEventListener('click', removeFailedAll);
  document.querySelector('#pasteForm')?.addEventListener('submit', addPasteTask);
  document.querySelector('#excelInput')?.addEventListener('change', importExcel);
  document.querySelector('#batchExcelInput')?.addEventListener('change', importBatchExcel);
  document.querySelectorAll('[data-work-mode]').forEach((button) => {
    button.addEventListener('click', () => setState({ workMode: button.dataset.workMode || 'single' }));
  });
  document.querySelector('[data-select-batch]')?.addEventListener('change', (event) => {
    const firstTask = state.tasks.find((task) => task.batchId === event.currentTarget.value);
    if (firstTask) selectTaskInView(firstTask.id, 'batch');
  });
  document.querySelectorAll('[data-batch-voice]').forEach((select) => {
    select.addEventListener('change', () => applyBatchVoice(select.dataset.batchVoice, select.value));
  });
  document.querySelectorAll('[data-batch-language]').forEach((select) => {
    select.addEventListener('change', () => applyBatchLanguage(select.dataset.batchLanguage, select.value));
  });
  document.querySelector('[data-batch-folder]')?.addEventListener('change', (event) => {
    setState({ batchExportFolderName: event.currentTarget.value });
  });
  document.querySelectorAll('[data-apply-batch-style]').forEach((button) => {
    button.addEventListener('click', () => applyStyleToBatch(button.dataset.applyBatchStyle, button.dataset.styleSource));
  });
  document.querySelectorAll('[data-confirm-batch-subtitles]').forEach((button) => {
    button.addEventListener('click', () => confirmBatchSubtitles(button.dataset.confirmBatchSubtitles));
  });
  document.querySelectorAll('[data-start-batch-audio]').forEach((button) => {
    button.addEventListener('click', () => generateBatchAudio(button.dataset.startBatchAudio));
  });
  document.querySelectorAll('[data-start-batch-video]').forEach((button) => {
    button.addEventListener('click', () => generateBatchVideos(button.dataset.startBatchVideo));
  });
  document.querySelectorAll('[data-start-batch-all]').forEach((button) => {
    button.addEventListener('click', () => startBatchAll(button.dataset.startBatchAll));
  });
  document.querySelector('#voiceForm')?.addEventListener('submit', addVoice);
  document.querySelectorAll('[data-delete-voice]').forEach((button) => {
    button.addEventListener('click', () => deleteVoice(button.dataset.deleteVoice));
  });
  document.querySelector('[data-refresh-materials]')?.addEventListener('click', scanMaterialsFromUi);
  document.querySelector('[data-init-materials]')?.addEventListener('click', initMaterialFoldersFromUi);
  document.querySelectorAll('[data-voice-task]').forEach((select) => {
    select.addEventListener('change', () => selectVoice(select.dataset.voiceTask, select.value));
  });
  document.querySelectorAll('[data-language-task]').forEach((select) => {
    select.addEventListener('change', () => selectLanguage(select.dataset.languageTask, select.value));
  });
  document.querySelectorAll('[data-style-task]').forEach((input) => {
    input.addEventListener('input', () => {
      updateTaskStyle(input.dataset.styleTask, input.dataset.styleTarget, input.dataset.styleKey, input.value);
    });
  });
  document.querySelectorAll('[data-title-hold-task]').forEach((input) => {
    input.addEventListener('input', () => {
      updateTitleHold(input.dataset.titleHoldTask, input.value);
    });
  });
  document.querySelectorAll('[data-drag-task]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      startDrag(event, button.dataset.dragTask, button.dataset.dragTarget);
    });
  });
  document.querySelectorAll('[data-frame-video]').forEach((video) => {
    video.addEventListener('loadedmetadata', () => {
      const seekTo = Math.min(0.08, (video.duration || 0) / 2 || 0.08);
      video.currentTime = seekTo;
    });
    video.addEventListener('seeked', () => {
      video.pause();
    });
  });
}

function languageName(language) {
  if (language === 'mandarin') return '普通话';
  if (language === 'english') return '英语';
  return '粤语';
}

function getVoiceName(voiceId) {
  const voice = state.voices.find((item) => item.id === voiceId) || state.voices.find((item) => item.id === state.defaultVoiceId);
  return voice ? voice.name : '默认声音未设置';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

render();
loadMaterialInventory();







