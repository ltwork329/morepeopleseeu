import * as XLSX from 'xlsx';
import './styles.css';

const STORAGE_KEY = 'local_video_workbench_state_v2';
const GENERATED_DATA_RESET_VERSION = '2026-04-30-keep-voices-2';

const pipelineSteps = [
  '文案上传',
  '文案生成音频',
  '匹配视频素材',
  '抓取素材首帧',
  'FunASR 识别字幕',
  '合成标题字幕',
  '导出最终视频',
];

const defaultMaterialFolders = {
  materialRoot: 'local_materials',
  unusedDir: 'local_materials/unused',
  fragmentsDir: 'local_materials/fragments',
  usedDir: 'local_materials/used',
  unifiedExportDir: 'Desktop/让更多人看到你_成片',
};

const projectMeta = {
  waidan: {
    label: '外单项目',
    shortLabel: '外单',
    note: '保持现有完整链路：文案、音频、字幕校对、视频合成。',
  },
  kitchen: {
    label: '二手厨具项目',
    shortLabel: '厨具',
    note: '独立走完整链路，并强制从外场、航拍、仓库内部三个素材池按比例拼接。',
  },
};

const defaultKitchenProjectConfig = {
  fragmentThreshold: 10,
  ratios: {
    outdoor: 50,
    aerial: 25,
    warehouse: 25,
  },
  pools: {
    outdoor: {
      label: '外场',
      unusedDir: 'local_materials/kitchen/outdoor/unused',
      fragmentsDir: 'local_materials/kitchen/outdoor/fragments',
      usedDir: 'local_materials/kitchen/outdoor/used',
    },
    aerial: {
      label: '航拍',
      unusedDir: 'local_materials/kitchen/aerial/unused',
      fragmentsDir: 'local_materials/kitchen/aerial/fragments',
      usedDir: 'local_materials/kitchen/aerial/used',
    },
    warehouse: {
      label: '仓库内部',
      unusedDir: 'local_materials/kitchen/warehouse/unused',
      fragmentsDir: 'local_materials/kitchen/warehouse/fragments',
      usedDir: 'local_materials/kitchen/warehouse/used',
    },
  },
};

const defaultAudioParams = {
  speed: 1,
  volume: 1,
  pitch: 0,
  timbre: 0,
  intensity: 0,
  magnetic: 0,
};

const defaultTitleStyle = {
  size: 64,
  color: '#ffffff',
  shadowColor: '#000000',
  x: 50,
  y: 18,
  width: 72,
};

const defaultSubtitleStyle = {
  size: 42,
  color: '#ffffff',
  x: 50,
  y: 78,
  width: 72,
};

function createEmptyInventoryBucket() {
  return { count: 0, totalDuration: 0, files: [] };
}

function createKitchenInventory() {
  return {
    outdoor: {
      label: '外场',
      unused: createEmptyInventoryBucket(),
      fragments: createEmptyInventoryBucket(),
      used: createEmptyInventoryBucket(),
    },
    aerial: {
      label: '航拍',
      unused: createEmptyInventoryBucket(),
      fragments: createEmptyInventoryBucket(),
      used: createEmptyInventoryBucket(),
    },
    warehouse: {
      label: '仓库内部',
      unused: createEmptyInventoryBucket(),
      fragments: createEmptyInventoryBucket(),
      used: createEmptyInventoryBucket(),
    },
  };
}

const initialState = {
  projectType: 'waidan',
  activeView: 'audio',
  workMode: 'single',
  activeTaskId: null,
  defaultVoiceId: null,
  lastAudioParams: defaultAudioParams,
  lastTitleStyle: defaultTitleStyle,
  lastSubtitleStyle: defaultSubtitleStyle,
  lastTitleHold: '8',
  batchExportFolderName: '',
  batchCount: 0,
  batchProcessingBatchId: null,
  batchAudioParams: defaultAudioParams,
  batchAudioParamsConfirmed: false,
  batchAudioParamsPanelOpen: false,
  tasks: [],
  voices: [],
  operationLogs: [],
  generatedDataResetVersion: GENERATED_DATA_RESET_VERSION,
  previewVideoUrl: '',
  noticeMessage: '',
  materialFolders: defaultMaterialFolders,
  kitchenProjectConfig: defaultKitchenProjectConfig,
  materialInventory: {
    unused: createEmptyInventoryBucket(),
    fragments: createEmptyInventoryBucket(),
    used: createEmptyInventoryBucket(),
    kitchen: createKitchenInventory(),
    updatedAt: null,
  },
};

let state = loadState();
if (state.generatedDataResetVersion === GENERATED_DATA_RESET_VERSION) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, noticeMessage: '' }));
}
if (shouldClearGeneratedDataFromUrl()) {
  window.history.replaceState({}, document.title, window.location.pathname);
}
const subtitleEditorOpenState = new Map();

function shouldClearGeneratedDataFromUrl() {
  return new URLSearchParams(window.location.search).get('clearGeneratedData') === '1';
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState;
  try {
    const parsedState = JSON.parse(raw);
    const saved = { ...initialState, ...parsedState };
    const shouldClearGeneratedData = shouldClearGeneratedDataFromUrl()
      || parsedState.generatedDataResetVersion !== GENERATED_DATA_RESET_VERSION;
    if (shouldClearGeneratedData) {
      return {
        ...initialState,
        projectType: saved.projectType === 'kitchen' ? 'kitchen' : 'waidan',
        activeView: 'audio',
        workMode: 'single',
        defaultVoiceId: saved.defaultVoiceId || null,
        voices: Array.isArray(saved.voices) ? saved.voices : [],
        lastAudioParams: {
          ...defaultAudioParams,
          ...((saved.lastAudioParams || {})),
        },
        lastTitleStyle: {
          ...defaultTitleStyle,
          ...((saved.lastTitleStyle || {})),
        },
        lastSubtitleStyle: {
          ...defaultSubtitleStyle,
          ...((saved.lastSubtitleStyle || {})),
        },
        lastTitleHold: saved.lastTitleHold || '8',
        batchAudioParams: {
          ...defaultAudioParams,
          ...((saved.lastAudioParams || saved.batchAudioParams || {})),
        },
        materialFolders: saved.materialFolders || defaultMaterialFolders,
        kitchenProjectConfig: saved.kitchenProjectConfig || defaultKitchenProjectConfig,
        materialInventory: saved.materialInventory || initialState.materialInventory,
        generatedDataResetVersion: GENERATED_DATA_RESET_VERSION,
        noticeMessage: '已清空生成记录和数据，克隆声音已保留。',
      };
    }
    const allowedViews = new Set(['audio', 'batch', 'compose', 'materials', 'logs']);
    const activeView = allowedViews.has(saved.activeView) ? saved.activeView : 'audio';
    const workMode = saved.workMode === 'batch' ? 'batch' : 'single';
    const defaultVoiceId = saved.defaultVoiceId || null;
    const projectType = saved.projectType === 'kitchen' ? 'kitchen' : 'waidan';
    return {
      ...saved,
      projectType,
      activeView,
      workMode,
      tasks: saved.tasks.map((task) => normalizeTask(task, defaultVoiceId)),
      operationLogs: saved.operationLogs || [],
      batchProcessingBatchId: saved.batchProcessingBatchId || null,
      lastAudioParams: {
        ...defaultAudioParams,
        ...((saved.lastAudioParams || {})),
      },
      lastTitleStyle: {
        ...defaultTitleStyle,
        ...((saved.lastTitleStyle || {})),
      },
      lastSubtitleStyle: {
        ...defaultSubtitleStyle,
        ...((saved.lastSubtitleStyle || {})),
      },
      lastTitleHold: saved.lastTitleHold || '8',
      batchAudioParams: {
        ...defaultAudioParams,
        ...((saved.batchAudioParams || saved.lastAudioParams || {})),
      },
      batchAudioParamsConfirmed: Boolean(saved.batchAudioParamsConfirmed),
      batchAudioParamsPanelOpen: Boolean(saved.batchAudioParamsPanelOpen),
      noticeMessage: '',
      materialFolders: saved.materialFolders || defaultMaterialFolders,
      kitchenProjectConfig: {
        ...defaultKitchenProjectConfig,
        ...(saved.kitchenProjectConfig || {}),
        ratios: {
          ...defaultKitchenProjectConfig.ratios,
          ...((saved.kitchenProjectConfig || {}).ratios || {}),
        },
        pools: {
          ...defaultKitchenProjectConfig.pools,
          ...((saved.kitchenProjectConfig || {}).pools || {}),
        },
      },
      materialInventory: saved.materialInventory || initialState.materialInventory,
    };
  } catch {
    return initialState;
  }
}

function normalizeTask(task, fallbackVoiceId = null) {
  return {
    ...task,
    projectType: task.projectType === 'kitchen' ? 'kitchen' : 'waidan',
    entryMode: task.entryMode === 'batch' ? 'batch' : 'single',
    itemNumber: task.itemNumber || `${getTodayKey()}_0001`,
    titleStyle: { ...defaultTitleStyle, ...(task.titleStyle || {}) },
    subtitleStyle: { ...defaultSubtitleStyle, ...(task.subtitleStyle || {}) },
    selectedVoiceId: task.selectedVoiceId || fallbackVoiceId,
    audioParams: {
      ...defaultAudioParams,
      ...((task.audioParams || {})),
    },
    audioParamsConfirmed: Boolean(task.audioParamsConfirmed),
    audioParamsPanelOpen: Boolean(task.audioParamsPanelOpen),
    composeHistory: task.composeHistory || [],
    materialFrameUrl: task.materialFrameUrl || null,
    audioUrl: normalizeAudioUrl(task.audioUrl || ''),
    videoUrl: task.videoUrl || '',
    outputPath: task.outputPath || '',
    titleHold: task.titleHold || '8',
    audioTraceId: task.audioTraceId || '',
    subtitleText: String(task.subtitleText || task.body || '').trim(),
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

function isSubtitleEditorOpen(taskId, fallback = true) {
  if (!taskId) return fallback;
  return subtitleEditorOpenState.has(taskId) ? subtitleEditorOpenState.get(taskId) : fallback;
}

function setSubtitleEditorOpen(taskId, isOpen) {
  if (!taskId) return;
  subtitleEditorOpenState.set(taskId, Boolean(isOpen));
}

function clampAudioParam(key, value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return defaultAudioParams[key] ?? 0;
  if (key === 'speed') return Math.max(0.5, Math.min(2, num));
  if (key === 'volume') return Math.max(0, Math.min(2, num));
  if (key === 'pitch') return Math.max(-12, Math.min(12, num));
  if (key === 'timbre') return Math.max(-20, Math.min(20, num));
  if (key === 'intensity') return Math.max(-20, Math.min(20, num));
  if (key === 'magnetic') return Math.max(-20, Math.min(20, num));
  return num;
}

function updateTaskAudioParam(taskId, key, value) {
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          audioParams: {
            ...defaultAudioParams,
            ...(task.audioParams || {}),
            [key]: clampAudioParam(key, value),
          },
          audioParamsConfirmed: false,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
}

function confirmTaskAudioParams(taskId) {
  if (!taskId) return;
  const source = state.tasks.find((task) => task.id === taskId);
  const confirmedParams = {
    ...defaultAudioParams,
    ...((source || {}).audioParams || {}),
  };
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          audioParams: confirmedParams,
          audioParamsConfirmed: true,
          audioParamsPanelOpen: false,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({
    tasks,
    lastAudioParams: confirmedParams,
    ...(state.workMode === 'batch' ? {} : { batchAudioParams: confirmedParams, batchAudioParamsConfirmed: true }),
  });
  const current = tasks.find((task) => task.id === taskId);
  if (current) {
    addOperationLog('音频参数确认', `#${current.itemNumber} 已确认`);
    notify(`音频参数已确认：#${current.itemNumber}`);
  }
}

function toggleTaskAudioParamsPanel(taskId, isOpen) {
  if (!taskId) return;
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          audioParamsPanelOpen: Boolean(isOpen),
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
}

function updateBatchAudioParam(key, value) {
  setState({
    batchAudioParams: {
      ...defaultAudioParams,
      ...(state.batchAudioParams || {}),
      [key]: clampAudioParam(key, value),
    },
    batchAudioParamsConfirmed: false,
  });
}

function confirmBatchAudioParams() {
  const batchId = state.tasks.find((task) => task.id === state.activeTaskId)?.batchId || '';
  if (!batchId) return;
  const confirmedParams = {
    ...defaultAudioParams,
    ...(state.batchAudioParams || {}),
  };
  const tasks = state.tasks.map((task) =>
    task.batchId === batchId
      ? {
          ...task,
          audioParams: confirmedParams,
          audioParamsConfirmed: true,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({
    tasks,
    lastAudioParams: confirmedParams,
    batchAudioParamsConfirmed: true,
    batchAudioParamsPanelOpen: false,
  });
  addOperationLog('批量音频参数确认', `${batchId} 已确认`);
  notify(`本批音频参数已确认：${batchId}`);
}

function toggleBatchAudioParamsPanel(isOpen) {
  setState({ batchAudioParamsPanelOpen: Boolean(isOpen) });
}

function getCurrentProjectMeta() {
  return projectMeta[state.projectType] || projectMeta.waidan;
}

function getProjectTypeLabel(projectType = state.projectType) {
  return projectMeta[projectType]?.label || projectMeta.waidan.label;
}

function getProjectTasks(projectType = state.projectType) {
  return (state.tasks || []).filter((task) => (task.projectType || 'waidan') === projectType);
}

function getSingleProjectTasks(projectType = state.projectType) {
  return getProjectTasks(projectType).filter((task) => task.entryMode !== 'batch');
}

function getBatchProjectTasks(projectType = state.projectType) {
  return getProjectTasks(projectType).filter((task) => task.entryMode === 'batch');
}

function renderKitchenEmptyBridge(message = '当前二手厨具项目还是空的。') {
  return renderEmpty(message);
}

function getKitchenConfig() {
  const saved = state.kitchenProjectConfig || defaultKitchenProjectConfig;
  return {
    fragmentThreshold: Math.max(1, Number(saved.fragmentThreshold || defaultKitchenProjectConfig.fragmentThreshold)),
    ratios: {
      outdoor: Math.max(0, Number(saved.ratios?.outdoor ?? defaultKitchenProjectConfig.ratios.outdoor)),
      aerial: Math.max(0, Number(saved.ratios?.aerial ?? defaultKitchenProjectConfig.ratios.aerial)),
      warehouse: Math.max(0, Number(saved.ratios?.warehouse ?? defaultKitchenProjectConfig.ratios.warehouse)),
    },
    pools: {
      outdoor: { ...defaultKitchenProjectConfig.pools.outdoor, ...(saved.pools?.outdoor || {}) },
      aerial: { ...defaultKitchenProjectConfig.pools.aerial, ...(saved.pools?.aerial || {}) },
      warehouse: { ...defaultKitchenProjectConfig.pools.warehouse, ...(saved.pools?.warehouse || {}) },
    },
  };
}

function updateKitchenRatio(poolKey, value) {
  const current = getKitchenConfig();
  const next = {
    ...current,
    ratios: {
      ...current.ratios,
      [poolKey]: Math.max(0, Number(value || 0)),
    },
  };
  setState({ kitchenProjectConfig: next });
}

function updateKitchenFragmentThreshold(value) {
  const current = getKitchenConfig();
  setState({
    kitchenProjectConfig: {
      ...current,
      fragmentThreshold: Math.max(1, Number(value || 10)),
    },
  });
}

function updateKitchenPoolPath(poolKey, pathKey, value) {
  const current = getKitchenConfig();
  setState({
    kitchenProjectConfig: {
      ...current,
      pools: {
        ...current.pools,
        [poolKey]: {
          ...current.pools[poolKey],
          [pathKey]: String(value || '').trim(),
        },
      },
    },
  });
}

function renderKitchenConfigPanel(mode = 'compose') {
  if (state.projectType !== 'kitchen') return '';
  const config = getKitchenConfig();
  const totalRatio = Number(config.ratios.outdoor || 0) + Number(config.ratios.aerial || 0) + Number(config.ratios.warehouse || 0);
  const title = mode === 'batch' ? '二手厨具视频池配置' : '二手厨具合成配置';
  return `
    <section class="panel kitchen-config-panel">
      <h3>${title}</h3>
      <div class="kitchen-ratio-strip">
        <label class="kitchen-inline-field">外场
          <input type="number" min="0" max="100" value="${Number(config.ratios.outdoor || 0)}" data-kitchen-ratio="outdoor" />
        </label>
        <label class="kitchen-inline-field">航拍
          <input type="number" min="0" max="100" value="${Number(config.ratios.aerial || 0)}" data-kitchen-ratio="aerial" />
        </label>
        <label class="kitchen-inline-field">仓库内部
          <input type="number" min="0" max="100" value="${Number(config.ratios.warehouse || 0)}" data-kitchen-ratio="warehouse" />
        </label>
        <label class="kitchen-inline-field kitchen-threshold-field">残片阈值
          <input type="number" min="1" max="60" value="${config.fragmentThreshold}" data-kitchen-threshold="true" />
        </label>
      </div>
      <div class="kitchen-ratio-summary ${totalRatio === 100 ? 'ok' : 'warn'}">比例合计 ${totalRatio}% ${totalRatio === 100 ? '' : '，建议调到 100%'}</div>
    </section>
  `;
}

function notify(message) {
  setState({ noticeMessage: String(message || '') });
}

async function loadMaterialInventory() {
  try {
    const response = await fetch(`/material_inventory.json?ts=${Date.now()}`);
    if (!response.ok) return;
    const inventory = await response.json();
    setState({
      materialInventory: {
        ...initialState.materialInventory,
        ...inventory,
        kitchen: {
          ...createKitchenInventory(),
          ...(inventory.kitchen || {}),
        },
      },
    });
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
    notify('已在本地完成文件夹创建和素材扫描。');
  } catch (error) {
    notify(`初始化失败：${error.message}\n请确认开发服务使用 npm run dev 启动。`);
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
      notify(`扫描失败：${error.message}\n请确认开发服务使用 npm run dev 启动。`);
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

function getNextItemSequence(day = getTodayKey()) {
  const prefix = `${day}_`;
  const maxExisting = getProjectTasks().reduce((max, task) => {
    const itemNumber = String(task?.itemNumber || '');
    if (!itemNumber.startsWith(prefix)) return max;
    const sequence = Number.parseInt(itemNumber.slice(prefix.length), 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return maxExisting + 1;
}

function createTask({ batchId, index, title, body, language = 'yue' }) {
  const inheritedAudioParams = state.workMode === 'batch'
    ? { ...defaultAudioParams, ...(state.batchAudioParams || {}) }
    : { ...defaultAudioParams, ...(state.lastAudioParams || {}) };
  const inheritedTitleStyle = { ...defaultTitleStyle, ...(state.lastTitleStyle || {}) };
  const inheritedSubtitleStyle = { ...defaultSubtitleStyle, ...(state.lastSubtitleStyle || {}) };
  const day = getTodayKey();
  const sequenceNumber = getNextItemSequence(day) + Math.max(0, Number(index || 1) - 1);
  const sequence = String(sequenceNumber).padStart(4, '0');
  const itemNumber = `${day}_${sequence}`;
  const id = `${batchId}_item_${sequence}`;
  return {
    id,
    projectType: state.projectType,
    entryMode: state.workMode === 'batch' ? 'batch' : 'single',
    audioParams: inheritedAudioParams,
    audioParamsConfirmed: state.workMode === 'batch' ? Boolean(state.batchAudioParamsConfirmed) : false,
    audioParamsPanelOpen: false,
    itemNumber,
    batchId,
    title: title.trim(),
    body: body.trim(),
    subtitleText: body.trim(),
    language: language || 'yue',
    titleStyle: inheritedTitleStyle,
    subtitleStyle: inheritedSubtitleStyle,
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
    titleHold: state.lastTitleHold || '8',
    audioTraceId: '',
    subtitleConfirmed: false,
  };
}

function shouldPreserveCurrentFocus() {
  return Boolean(state.activeTaskId);
}

function normalizeAudioUrl(audioUrl) {
  const text = String(audioUrl || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, window.location.origin);
    if (url.pathname.startsWith('/generated_audio/')) {
      return `${url.pathname}${url.search}`;
    }
    if (url.pathname === '/api/generated/audio') {
      const fileName = url.searchParams.get('name');
      if (!fileName) return '';
      const ts = url.searchParams.get('ts');
      return `/generated_audio/${fileName}${ts ? `?ts=${ts}` : ''}`;
    }
    return url.toString();
  } catch {
    return text;
  }
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
    const task = state.tasks.find((item) => item.id === taskId);
    const projectType = task?.projectType || state.projectType || 'waidan';
    const response = await fetch(`http://127.0.0.1:3210/api/materials/first-frame?projectType=${encodeURIComponent(projectType)}`);
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
    notify(`没有抓取到首帧：${error.message}`);
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
    const response = await fetch(`http://127.0.0.1:3210/api/materials/first-frame?projectType=${encodeURIComponent(current.projectType || state.projectType || 'waidan')}`);
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
    notify('每个视频都必须有标题和文案正文。');
    return;
  }

  const batchId = createBatchId();
  const task = createTask({
    batchId,
    index: 1,
    title,
    body,
  });

  const preserveFocus = shouldPreserveCurrentFocus();
  setState({
    batchCount: state.batchCount + 1,
    tasks: [task, ...state.tasks],
    activeTaskId: preserveFocus ? state.activeTaskId : task.id,
    activeView: preserveFocus ? state.activeView : 'audio',
  });
  addOperationLog('文案上传', `#${task.itemNumber} ${task.title}`);
  if (preserveFocus) notify(`已加入队列：#${task.itemNumber}`);
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
    notify('Excel 需要两列：标题+文案（或 title+body），每行一条。');
    return;
  }

  const batchId = createBatchId();
  const prevMode = state.workMode;
  state.workMode = 'single';
  const tasks = validRows.map((row, index) =>
    createTask({
      batchId,
      index: index + 1,
      title: row.title,
      body: row.body,
      language: row.language || 'yue',
    }),
  );
  state.workMode = prevMode;

  const preserveFocus = shouldPreserveCurrentFocus();
  setState({
    batchCount: state.batchCount + 1,
    tasks: [...tasks, ...state.tasks],
    activeTaskId: preserveFocus ? state.activeTaskId : tasks[0].id,
    activeView: preserveFocus ? state.activeView : 'audio',
  });
  addOperationLog('Excel导入', `导入 ${tasks.length} 条文案`);
  if (preserveFocus) notify(`已加入队列：${tasks.length} 条`);
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
    notify('Excel 需要两列：标题+文案（或 title+body），每行一条。');
    return;
  }

  const batchId = createBatchId();
  const prevMode = state.workMode;
  state.workMode = 'batch';
  const tasks = validRows.map((row, index) =>
    createTask({
      batchId,
      index: index + 1,
      title: row.title,
      body: row.body,
      language: row.language || 'yue',
    }),
  );
  state.workMode = prevMode;

  const preserveFocus = shouldPreserveCurrentFocus();
  setState({
    batchCount: state.batchCount + 1,
    tasks: [...tasks, ...state.tasks],
    activeTaskId: preserveFocus ? state.activeTaskId : tasks[0].id,
    activeView: preserveFocus ? state.activeView : 'batch',
    workMode: 'batch',
    batchExportFolderName: `${batchId}_videos`,
  });
  addOperationLog('批量文案导入', `${batchId} / ${tasks.length} 条`);
  if (preserveFocus) notify(`已加入队列：${batchId} / ${tasks.length} 条`);
  event.target.value = '';
}

async function addVoice(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const name = String(form.get('voiceName') || '').trim();
  const sampleFile = form.get('voiceSample');
  if (!name) {
    notify('请先给克隆声音起一个名字。');
    return;
  }
  if (!(sampleFile instanceof File) || !sampleFile.size) {
    notify('请上传声音样本（音频或视频）');
    return;
  }

  try {
    notify('已提交声音克隆，请等待。');
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
    formElement?.reset();
    notify('声音克隆成功');
  } catch (error) {
    addOperationLog('声音克隆失败', error.message, 'error');
    notify(`声音克隆失败：${error.message}`);
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
    notify('声音已删除，并已同步到 MiniMax');
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
    notify(`删除失败：${error.message}`);
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

function removeBatchTasks(batchId) {
  if (!batchId) return;
  const batchTasks = state.tasks.filter((task) => task.batchId === batchId);
  if (!batchTasks.length) return;
  if (!confirm(`确认取消本批文案？\n${batchId} / ${batchTasks.length} 条`)) return;
  const batchIds = [...new Set(state.tasks.map((task) => task.batchId).filter(Boolean))].filter((id) => id !== batchId);
  const remainingTasks = state.tasks.filter((task) => task.batchId !== batchId);
  const nextActiveTaskId = remainingTasks.find((task) => task.batchId === batchIds[0])?.id || remainingTasks[0]?.id || null;
  setState({
    tasks: remainingTasks,
    activeTaskId: nextActiveTaskId,
  });
  addOperationLog('取消本批文案', `${batchId} / ${batchTasks.length} 条`, 'error');
  notify(`已取消本批文案：${batchId}`);
}

async function generateAudio(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (!task.audioParamsConfirmed) {
    notify('请先确认音频参数，再生成音频。');
    return;
  }
  const voiceId = task.selectedVoiceId || state.defaultVoiceId;
  if (!voiceId) {
    notify('请先在声音克隆页面完成克隆，再回来生成音频');
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
  notify(`已提交生成音频：#${task.itemNumber}`);

  try {
    const response = await fetch('http://127.0.0.1:3210/api/minimax/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemNumber: task.itemNumber,
        text: task.body,
        language: task.language || 'yue',
        voiceId,
        audioParams: task.audioParams || defaultAudioParams,
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
            audioUrl: normalizeAudioUrl(`${result.audioUrl}?ts=${Date.now()}`),
            audioTraceId: result.traceId || '',
            subtitleText: String(item.subtitleText || item.body || '').trim(),
            subtitleConfirmed: false,
            stepIndex: Math.max(item.stepIndex, 1),
            progress: Math.max(item.progress, 17),
            status: '待合成',
            statusReason: '',
            message: '音频已生成，请先确认字幕和标题样式',
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
    notify('请先生成音频，再一键合成视频。');
    return;
  }
  if (!task.subtitleConfirmed) {
    notify('请先确认这条任务的字幕和标题样式，再开始合成视频。');
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
  notify(`已提交合成视频：#${task.itemNumber}`);

  try {
    const cleanAudioUrl = String(task.audioUrl).split('?')[0];
    const subtitle = getTaskSubtitleText(task);
    const response = await fetch('http://127.0.0.1:3210/api/compose/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemNumber: task.itemNumber,
        projectType: task.projectType || state.projectType || 'waidan',
        kitchenConfig: state.projectType === 'kitchen' ? getKitchenConfig() : null,
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
    const segmentDetail = formatSegmentDetails(result.segmentDetails || []);
    const sourceDetail = (result.sourceMaterials || []).filter(Boolean).join(' / ');
    addOperationLog(
      '视频合成成功',
      `#${task.itemNumber} ${result.videoUrl}${segmentDetail ? ` ｜分段：${segmentDetail}` : sourceDetail ? ` ｜素材：${sourceDetail}` : ''}`,
    );
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
  return getProjectTasks().filter((task) => task.batchId === batchId);
}

function getAllBatchTasks(batchId) {
  return (state.tasks || []).filter((task) => task.batchId === batchId);
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
  const sourceTask = state.tasks.find((task) => task.id === state.activeTaskId && task.batchId === batchId)
    || state.tasks.find((task) => task.batchId === batchId)
    || null;
  if (!sourceTask) return;
  const confirmedTitleStyle = { ...defaultTitleStyle, ...(sourceTask.titleStyle || {}) };
  const confirmedSubtitleStyle = { ...defaultSubtitleStyle, ...(sourceTask.subtitleStyle || {}) };
  const confirmedTitleHold = sourceTask.titleHold || '8';
  const tasks = state.tasks.map((task) =>
    task.batchId === batchId
      ? {
          ...task,
          titleStyle: confirmedTitleStyle,
          subtitleStyle: confirmedSubtitleStyle,
          titleHold: confirmedTitleHold,
          subtitleConfirmed: true,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({
    tasks,
    lastTitleStyle: confirmedTitleStyle,
    lastSubtitleStyle: confirmedSubtitleStyle,
    lastTitleHold: confirmedTitleHold,
  });
  addOperationLog('批量字幕确认', `${batchId} 已确认标题和字幕样式`);
  notify(`这个批次已同步并确认 ${tasks.filter((task) => task.batchId === batchId && task.subtitleConfirmed).length}/${tasks.filter((task) => task.batchId === batchId).length} 条。`);
}

function confirmTaskSubtitle(taskId) {
  if (!taskId) return;
  syncTaskSubtitleFromDom(taskId);
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return;
  const confirmedTitleStyle = { ...defaultTitleStyle, ...(current.titleStyle || {}) };
  const confirmedSubtitleStyle = { ...defaultSubtitleStyle, ...(current.subtitleStyle || {}) };
  const confirmedTitleHold = current.titleHold || '8';
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          titleStyle: confirmedTitleStyle,
          subtitleStyle: confirmedSubtitleStyle,
          titleHold: confirmedTitleHold,
          subtitleConfirmed: true,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  const confirmedTask = tasks.find((task) => task.id === taskId) || current;
  const batchId = confirmedTask.batchId || '';
  let nextActiveTaskId = state.activeTaskId;
  let batchMessage = '';
  if (batchId) {
    const batchTasks = tasks.filter((task) => task.batchId === batchId);
    const confirmedCount = batchTasks.filter((task) => task.subtitleConfirmed).length;
    nextActiveTaskId = taskId;
    batchMessage = `当前批次已确认 ${confirmedCount}/${batchTasks.length} 条。`;
  }
  setState({
    tasks,
    activeTaskId: nextActiveTaskId,
    lastTitleStyle: confirmedTitleStyle,
    lastSubtitleStyle: confirmedSubtitleStyle,
    lastTitleHold: confirmedTitleHold,
  });
  addOperationLog('字幕确认', `#${current.itemNumber} 已确认标题和字幕样式`);
  notify(`这条字幕已确认。${batchMessage || '现在可以合成视频。'}`);
}

function updateTaskSubtitleText(taskId, value) {
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          subtitleText: String(value || ''),
          subtitleConfirmed: false,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
}

function readSubtitleEditorValue(taskId) {
  const textarea = document.querySelector(`[data-subtitle-text-task="${taskId}"]`);
  return textarea ? textarea.value : null;
}

function syncTaskSubtitleFromDom(taskId) {
  const currentValue = readSubtitleEditorValue(taskId);
  if (currentValue === null) return;
  const currentTask = state.tasks.find((task) => task.id === taskId);
  if (!currentTask) return;
  if (String(currentTask.subtitleText || '') === String(currentValue)) return;
  updateTaskSubtitleText(taskId, currentValue);
}

function replaceTaskSubtitle(taskId, replaceAll = false) {
  if (!taskId) return;
  syncTaskSubtitleFromDom(taskId);
  const findInput = document.querySelector(`[data-subtitle-find="${taskId}"]`);
  const replaceInput = document.querySelector(`[data-subtitle-replace="${taskId}"]`);
  const findValue = String(findInput?.value || '').trim();
  const replaceValue = String(replaceInput?.value || '');
  if (!findValue) {
    notify('请先输入要替换的字。');
    return;
  }

  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return;
  const source = String(current.subtitleText || current.body || '');
  const nextText = replaceAll
    ? source.split(findValue).join(replaceValue)
    : source.replace(findValue, replaceValue);

  if (nextText === source) {
    notify('当前字幕里没有找到这个词。');
    return;
  }

  updateTaskSubtitleText(taskId, nextText);
  addOperationLog('字幕替换', `#${current.itemNumber} ${findValue} → ${replaceValue}`);
}

function rememberTaskSubtitle(taskId) {
  syncTaskSubtitleFromDom(taskId);
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return;
  addOperationLog('字幕暂存', `#${current.itemNumber} 已保存当前字幕修改`);
  notify('当前字幕修改已保存。');
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
          subtitleConfirmed: false,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks });
  addOperationLog('批量套用样式', `${batchId} 已套用`);
}

async function createBatchFolders(batchId) {
  if (!batchId) return;
  try {
    const response = await fetch('http://127.0.0.1:3210/api/batch/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '创建失败');
    }
    addOperationLog('批量文件夹创建', `${batchId} / ${result.exportDir}`);
    notify(`已打开两个文件夹：\n素材：${result.materialDir}\n成片：${result.exportDir}`);
  } catch (error) {
    addOperationLog('批量文件夹创建失败', `${batchId} / ${error.message}`, 'error');
    notify(`创建失败：${error.message}`);
  }
}

async function loadMaterialFolders() {
  try {
    const response = await fetch('http://127.0.0.1:3210/api/materials/folders');
    const result = await response.json();
    if (!response.ok || !result.ok) return;
    setState({
      materialFolders: {
        materialRoot: result.materialRoot || defaultMaterialFolders.materialRoot,
        unusedDir: result.unusedDir || defaultMaterialFolders.unusedDir,
        fragmentsDir: result.fragmentsDir || defaultMaterialFolders.fragmentsDir,
        usedDir: result.usedDir || defaultMaterialFolders.usedDir,
        unifiedExportDir: result.unifiedExportDir || defaultMaterialFolders.unifiedExportDir,
      },
    });
  } catch {
    // Keep default local folders when API is temporarily unavailable.
  }
}

async function generateBatchAudio(batchId, options = {}) {
  const { force = false } = options;
  const tasks = getBatchTasks(batchId);
  for (const task of tasks) {
    if (!force && task.audioStatus === '已生成' && task.audioUrl) continue;
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

async function runBatchRender(batchId, tasksToRender, runLabel = '批量合成') {
  if (!tasksToRender.length) {
    notify('没有可合成的任务。');
    return;
  }
  const unconfirmedTasks = tasksToRender.filter((task) => !task.subtitleConfirmed);
  if (unconfirmedTasks.length) {
    notify(`请先确认字幕和标题样式，再继续合成。当前还有 ${unconfirmedTasks.length} 条未确认。`);
    return;
  }
  const taskIds = new Set(tasksToRender.map((task) => task.id));
  const runningTasks = state.tasks.map((task) =>
    task.batchId === batchId && taskIds.has(task.id)
      ? {
          ...task,
          status: '处理中',
          videoStatus: '合成中',
          statusReason: '',
          message: '正在抓取素材并合成视频',
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  setState({ tasks: runningTasks, batchProcessingBatchId: batchId });
  try {
    const payloadTasks = tasksToRender.map((task) => ({
      id: task.id,
      itemNumber: task.itemNumber,
      projectType: task.projectType || state.projectType || 'waidan',
      title: task.title,
      subtitle: getTaskSubtitleText(task),
      titleStyle: task.titleStyle || {},
      subtitleStyle: task.subtitleStyle || {},
      titleHold: task.titleHold || '8',
      audioUrl: String(task.audioUrl).split('?')[0],
    }));
    const response = await fetch('http://127.0.0.1:3210/api/compose/batch-render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectType: state.projectType || 'waidan',
        kitchenConfig: state.projectType === 'kitchen' ? getKitchenConfig() : null,
        tasks: payloadTasks,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '批量合成失败');
    }
    const mapById = new Map((result.results || []).map((item) => [String(item.taskId || item.id || ''), item]));
    const nextTasks = state.tasks.map((task) => {
      if (task.batchId !== batchId) return task;
      const hit = mapById.get(task.id);
      if (!hit) return task;
      return {
        ...task,
        stepIndex: pipelineSteps.length - 1,
        progress: 100,
        status: '成功',
        videoStatus: '已合成',
        statusReason: '',
        message: `已导出：${hit.videoUrl}`,
        videoUrl: `${hit.videoUrl}?ts=${Date.now()}`,
        outputPath: hit.outputPath || '',
        materialFrame: hit.usedMaterial || task.materialFrame,
        materialFrameUrl: hit.previewUrl ? `${hit.previewUrl}&t=${Date.now()}` : task.materialFrameUrl,
        updatedAt: new Date().toISOString(),
      };
    });
    setState({ tasks: nextTasks, batchProcessingBatchId: null });
    await scanMaterialsFromUi({ silent: true });
    const batchDetails = (result.results || [])
      .map((item) => {
        const detail = formatSegmentDetails(item.segmentDetails || []);
        return detail ? `#${item.taskId || item.itemNumber || ''} ${detail}` : '';
      })
      .filter(Boolean)
      .join('\n');
    addOperationLog(runLabel, `${batchId} 共导出 ${(result.results || []).length} 条${batchDetails ? `\n${batchDetails}` : ''}`);
    const exportDir = result.exportDir || state.materialFolders?.unifiedExportDir || '';
    notify(`${runLabel}完成：已导出 ${(result.results || []).length} 条\n导出目录：${exportDir}`);
  } catch (error) {
    const reason = error.message === 'Failed to fetch'
      ? '合成服务连接中断：请点“继续合并（不重生音频）”，会直接复用已生成音频重新合成。'
      : error.message;
    const failedTasks = state.tasks.map((task) =>
      task.batchId === batchId && tasksToRender.some((it) => it.id === task.id)
        ? {
            ...task,
            status: task.status === '成功' ? task.status : '失败',
            videoStatus: task.videoStatus === '已合成' ? task.videoStatus : '未合成',
            statusReason: reason,
            message: `批量合成失败：${reason}`,
            updatedAt: new Date().toISOString(),
          }
        : task,
    );
    setState({ tasks: failedTasks, batchProcessingBatchId: null });
    addOperationLog(`${runLabel}失败`, `${batchId} / ${reason}`, 'error');
    notify(`批量合成失败：${reason}`);
  }
}

async function startBatchAll(batchId) {
  if (!batchId) return;
  if (!state.batchAudioParamsConfirmed) {
    notify('请先确认本批音频参数。');
    return;
  }
  let batchTasks = getBatchTasks(batchId);
  addOperationLog('批量开始', `${batchId} 开始自动执行`);
  notify(`已提交批量生成音频：${batchId}`);
  await generateBatchAudio(batchId, { force: false });
  batchTasks = getBatchTasks(batchId);
  const pendingAudio = batchTasks.filter((task) => task.audioStatus !== '已生成' || !task.audioUrl);
  if (pendingAudio.length) {
    addOperationLog('批量终止', `${batchId} 仍有 ${pendingAudio.length} 条音频未生成`, 'error');
    notify(`批量终止：还有 ${pendingAudio.length} 条音频未成功生成。`);
    return;
  }
  const pendingConfirm = batchTasks.filter((task) => !task.subtitleConfirmed);
  if (pendingConfirm.length) {
    addOperationLog('批量等待确认', `${batchId} 仍有 ${pendingConfirm.length} 条字幕/标题样式未确认`);
    notify(`音频已生成，但还有 ${pendingConfirm.length} 条未确认字幕和标题样式。请先确认，再继续导出。`);
    return;
  }
  await runBatchRender(batchId, batchTasks, '批量一键执行');
}

async function continueBatchCompose(batchId) {
  if (!batchId) return;
  const batchTasks = getBatchTasks(batchId);
  const targets = batchTasks.filter(
    (task) => task.audioStatus === '已生成' && task.audioUrl && task.videoStatus !== '已合成' && task.subtitleConfirmed,
  );
  if (!targets.length) {
    notify('没有可继续合并的任务（需已生成音频、已确认字幕样式且未合成）。');
    return;
  }
  addOperationLog('继续合并', `${batchId} 仅重试视频合成 ${targets.length} 条`);
  notify(`已提交批量合成视频：${batchId}`);
  await runBatchRender(batchId, targets, '继续合并');
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
    const nextValue = key === 'color' || key === 'shadowColor' ? value : Number(value);
    return {
      ...task,
      [styleKey]: {
        ...task[styleKey],
        [key]: nextValue,
      },
      subtitleConfirmed: false,
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
          subtitleConfirmed: false,
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
  let lastWidth = Number(element.dataset.width || 72);
  const mode = event.target?.dataset?.resizeEdge ? 'resize' : 'move';
  element.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
    const rect = board.getBoundingClientRect();
    if (mode === 'resize') {
      const pointerX = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      lastWidth = Math.round(Math.min(96, Math.max(24, Math.abs(pointerX - lastX) * 2)));
      element.style.width = `${lastWidth}%`;
      element.dataset.width = String(lastWidth);
      return;
    }
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
          width: lastWidth,
        },
        subtitleConfirmed: false,
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

function getTaskSubtitleText(task) {
  const text = String(task?.subtitleText || task?.body || '').trim();
  return text || '字幕预览文字';
}

function formatSegmentDetails(segmentDetails = []) {
  return (segmentDetails || [])
    .filter((item) => item && (item.poolLabel || item.sourceMaterial))
    .map((item) => {
      const pool = String(item.poolLabel || item.poolKey || '').trim();
      const source = String(item.sourceMaterial || '').trim();
      const duration = Number(item.clipDuration || 0);
      const durationText = duration > 0 ? `${duration.toFixed(1)}s` : '';
      return [pool, source, durationText].filter(Boolean).join(' ');
    })
    .join(' / ');
}

function renderAudioParamRows(params, scope) {
  const values = { ...defaultAudioParams, ...(params || {}) };
  const bind = (key) => scope === 'task'
    ? `data-audio-param-task="${state.activeTaskId || ''}" data-audio-param-key="${key}"`
    : `data-batch-audio-param="${key}"`;
  const simpleRow = (label, key, min, max, step = 1) => `
    <label class="style-row">
      <span class="style-label">${label}</span>
      <span class="style-control style-control-with-value">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${values[key]}" ${bind(key)} />
        <small>${values[key]}</small>
      </span>
    </label>
  `;
  const bipolarRow = (leftLabel, rightLabel, key) => `
    <label class="style-row audio-bipolar-row">
      <span class="style-label audio-side-label left">${leftLabel}</span>
      <span class="style-control style-control-with-value audio-bipolar-control">
        <small>${values[key]}</small>
        <input type="range" min="-20" max="20" step="1" value="${values[key]}" ${bind(key)} />
        <span class="audio-side-label right">${rightLabel}</span>
      </span>
    </label>
  `;
  return `
    ${simpleRow('语速', 'speed', 0.5, 2, 0.1)}
    ${simpleRow('音量', 'volume', 0, 2, 0.1)}
    ${simpleRow('声调', 'pitch', -12, 12, 1)}
    ${bipolarRow('低沉', '明亮', 'timbre')}
    ${bipolarRow('力度感', '柔和', 'intensity')}
    ${bipolarRow('磁性', '清脆', 'magnetic')}
  `;
}

function renderTaskAudioParamsPanel(task) {
  if (!task) return '';
  return `
    <details class="panel compact-fold" data-audio-param-fold-task="${task.id}" ${task.audioParamsPanelOpen ? 'open' : ''}>
      <summary>高级音频参数</summary>
      <div class="style-card">
        ${renderAudioParamRows(task.audioParams, 'task')}
        <div class="material-actions">
          <button class="primary" type="button" data-confirm-audio-params="${task.id}">确认音频参数</button>
        </div>
      </div>
    </details>
  `;
}

function renderBatchAudioParamsPanel() {
  return `
    <details class="panel compact-fold" data-batch-audio-param-fold="true" ${state.batchAudioParamsPanelOpen ? 'open' : ''}>
      <summary>批量默认音频参数</summary>
      <div class="style-card">
        ${renderAudioParamRows(state.batchAudioParams, 'batch')}
        <div class="material-actions">
          <button class="primary" type="button" data-confirm-batch-audio-params="true">确认本批音频参数</button>
        </div>
      </div>
    </details>
  `;
}

function render() {
  const currentProject = getCurrentProjectMeta();
  const projectTasks = state.activeView === 'batch'
    ? getBatchProjectTasks()
    : getSingleProjectTasks();
  const activeTask = projectTasks.find((task) => task.id === state.activeTaskId) || projectTasks[0] || null;
  document.querySelector('#app').innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">片</span>
          <div>
            <strong>让更多人看到你</strong>
            <small>本地短视频工作台</small>
          </div>
        </div>
        <div class="project-switch">
          <button class="project-pill ${state.projectType === 'waidan' ? 'active' : ''}" data-project-type="waidan" type="button">外单项目</button>
          <button class="project-pill ${state.projectType === 'kitchen' ? 'active' : ''}" data-project-type="kitchen" type="button">二手厨具</button>
        </div>
        <div class="project-note">
          <strong>${currentProject.label}</strong>
          <small>${currentProject.note}</small>
        </div>
        ${renderNav('audio', '单条-生成音频')}
        ${renderNav('compose', '单条-合成视频')}
        ${renderNav('batch', '批量制作')}
        ${renderNav('materials', '素材库')}
        ${renderNav('logs', '操作记录')}
        <div class="local-note">本地模式。批次号和编号自动生成。</div>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">清晰流程</p>
            <h1>${currentProject.label} · 文案上传 → 生成音频 → 字幕校对 → 合成最终视频</h1>
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
      ${renderNoticeModal()}
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
  const projectTasks = getSingleProjectTasks();
  const taskOptions = projectTasks.map((task) =>
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
          ${activeTask ? renderTaskAudioParamsPanel(activeTask) : ''}
          ${projectTasks.length ? `
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
                ${activeTask?.audioUrl ? renderAudioPreview(activeTask.audioUrl) : ''}
                ${activeTask?.audioStatus === '已生成' ? `<button class="soft" data-view="compose" type="button">去单条-合成视频</button>` : ''}
                ${activeTask?.statusReason ? `<small class="log-error-text">原因：${escapeHtml(activeTask.statusReason)}</small>` : ''}
              </div>
            </div>
          ` : renderKitchenEmptyBridge(`先在${getProjectTypeLabel()}里上传文案`)}
        </section>
      </div>
      <div class="audio-right">
        ${renderTaskBoard(activeTask)}
      </div>
    </section>
  `;
}

function renderTaskBoard(activeTask) {
  const tasks = getSingleProjectTasks();
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
          ${activeTask.audioUrl ? renderAudioPreview(activeTask.audioUrl) : ''}
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

function renderNoticeModal() {
  if (!state.noticeMessage) return '';
  return `
    <div class="video-modal" data-close-notice="true">
      <div class="video-modal-card notice-modal-card" onclick="event.stopPropagation()">
        <div class="panel-heading">
          <h3>提示</h3>
          <button class="danger" type="button" data-close-notice="true">关闭</button>
        </div>
        <pre class="notice-text">${escapeHtml(state.noticeMessage)}</pre>
      </div>
    </div>
  `;
}

function renderBatchWorkbench(activeTask) {
  const projectTasks = getBatchProjectTasks();
  const batchIds = [...new Set(projectTasks.map((task) => task.batchId).filter(Boolean))];
  const activeBatchId = activeTask?.batchId || batchIds[0] || '';
  const allBatchTasks = getAllBatchTasks(activeBatchId);
  const batchTasks = getBatchTasks(activeBatchId);
  const isBatchRunning = state.batchProcessingBatchId === activeBatchId;
  const pendingBatchTasks = batchTasks.filter((task) => task.videoStatus !== '已合成');
  const progressBatchTasks = batchTasks.filter((task) => task.videoStatus !== '已合成');
  const completedBatchTasks = batchTasks.filter((task) => task.videoStatus === '已合成');
  const batchActiveTask =
    pendingBatchTasks.find((task) => task.id === activeTask?.id) ||
    pendingBatchTasks[0] ||
    null;
  const doneAudio = allBatchTasks.filter((task) => task.audioStatus === '已生成').length;
  const doneVideo = allBatchTasks.filter((task) => task.videoStatus === '已合成').length;
  const confirmedCount = allBatchTasks.filter((task) => task.subtitleConfirmed).length;
  const voiceOptions = state.voices.map((voice) =>
    `<option value="${voice.id}" ${batchActiveTask?.selectedVoiceId === voice.id ? 'selected' : ''}>${escapeHtml(voice.name)}</option>`,
  ).join('');
  const folders = state.materialFolders || defaultMaterialFolders;
  const batchDocRows = pendingBatchTasks.map((task) => `
    <tr>
      <td>${escapeHtml(task.batchId || '')} / ${escapeHtml(task.itemNumber)}</td>
      <td>${escapeHtml(task.title)}</td>
      <td>${escapeHtml(task.body || '')}</td>
    </tr>
  `).join('');
  const rows = progressBatchTasks.map((task) => `
    <div class="batch-simple-row ${batchActiveTask?.id === task.id ? 'selected' : ''}" data-pick-task="${task.id}" data-pick-view="batch" role="button" tabindex="0">
      <span class="status ${statusClass(task.status)}">${task.status}</span>
      <strong>#${task.itemNumber} ${escapeHtml(task.title)}</strong>
      <span>音频：${task.audioStatus}</span>
      <span>字幕：${task.subtitleConfirmed ? '已确认' : '待确认'}</span>
      <span>视频：${task.videoStatus}</span>
      <span class="batch-reason">${task.statusReason ? escapeHtml(task.statusReason) : '无异常'}</span>
      <span class="batch-row-actions">
        ${(task.audioStatus === '已生成' && task.videoStatus !== '已合成' && (String(task.status).includes('失败') || task.videoStatus === '未合成'))
          ? `<button class="soft" type="button" data-stop-row="true" data-continue-batch-compose="${activeBatchId}">合成视频</button>`
          : ''}
        <button class="danger" type="button" data-stop-row="true" data-remove-task="${task.id}">删除</button>
      </span>
    </div>
  `).join('');
  const historyRows = getProjectTasks()
    .filter((task) => task.videoStatus === '已合成')
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map((task) => `<li>#${escapeHtml(task.itemNumber)} / ${escapeHtml(task.title)} / ${escapeHtml(task.status)} / ${formatTime(task.updatedAt)}</li>`)
    .join('');
  return `
    <section class="batch-shell">
      <div class="batch-left">
      <div class="panel batch-list-panel">
        <p class="eyebrow">批量制作</p>
        <h2>上传批量文案后，先生成音频，再确认字幕样式，最后导出</h2>
        ${renderKitchenConfigPanel('batch')}
        <div class="batch-upload-row">
          <label class="batch-upload-compact">
            <input id="batchExcelInput" type="file" accept=".xlsx,.xls,.csv" />
            <span>上传批量文案 Excel</span>
          </label>
          ${batchIds.length ? `<button class="danger" type="button" data-remove-batch="${activeBatchId}">取消本批文案</button>` : ''}
          <p class="batch-upload-hint">上传后可在下方折叠区查看全部批次号、标题、文案。</p>
        </div>
        ${batchIds.length ? `
          <details class="batch-docs-fold">
            <summary>查看本批全部文案（默认折叠）</summary>
            <div class="batch-docs-wrap">
              <table class="batch-docs-table">
                <thead><tr><th>批次编号</th><th>标题</th><th>文案</th></tr></thead>
                <tbody>${batchDocRows || '<tr><td colspan="3">当前批次没有待处理文案</td></tr>'}</tbody>
              </table>
            </div>
          </details>
        ` : ''}
        ${batchIds.length ? `
          ${renderBatchAudioParamsPanel()}
          <div class="batch-form-grid">
            <label>选择批次
              <select data-select-batch="true">
                ${batchIds.map((batchId) => `<option value="${batchId}" ${batchId === activeBatchId ? 'selected' : ''}>${batchId}（${getAllBatchTasks(batchId).length}条）</option>`).join('')}
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
            <label>统一导出文件夹（固定）
              <input type="text" value="${escapeHtml(folders.unifiedExportDir || defaultMaterialFolders.unifiedExportDir)}" readonly />
            </label>
          </div>
          <div class="batch-stats">
            <div><span>总数</span><strong>${allBatchTasks.length}</strong></div>
            <div><span>音频</span><strong>${doneAudio}/${allBatchTasks.length}</strong></div>
            <div><span>字幕确认</span><strong>${confirmedCount}/${allBatchTasks.length}</strong></div>
            <div><span>导出</span><strong>${doneVideo}/${allBatchTasks.length}</strong></div>
          </div>
          <div class="material-actions">
            <button class="primary" type="button" data-start-batch-all="${activeBatchId}">生成音频</button>
            <button class="soft" type="button" data-batch-grab-frame="${batchActiveTask?.id || ''}">仅抓取首帧</button>
            <button class="soft" type="button" data-confirm-batch-subtitles="${activeBatchId}">确认标题和字幕样式</button>
            <button class="soft" type="button" data-continue-batch-compose="${activeBatchId}">合成视频</button>
          </div>
          ${isBatchRunning ? '<p class="batch-running-tip">后台正在合成中；左侧仍可继续上传文案、生成音频、确认字幕和调位置。</p>' : ''}
        ` : renderKitchenEmptyBridge('先上传批量文案 Excel')}
      </div>
      <div class="panel batch-preview-panel">
        <p class="eyebrow">字幕和标题预览</p>
        <h2>这个批次的任务逐条确认字幕位置和标题时长</h2>
        ${batchActiveTask ? renderBatchSubtitleNavigator(batchTasks, batchActiveTask) : ''}
        ${batchActiveTask ? renderSubtitleEditorPanel(batchActiveTask, batchActiveTask.subtitleConfirmed ? '重新确认当前字幕' : '确认当前字幕') : ''}
        ${batchActiveTask ? renderComposePreview(batchActiveTask) : renderKitchenEmptyBridge(doneVideo ? '当前批次都已合成，请在过往记录查看。' : '先导入批量文案')}
      </div>
      </div>
      <div class="panel batch-records-panel">
        <p class="eyebrow">批量任务</p>
        <h2>右侧看整体进度和失败原因</h2>
        <div class="batch-simple-list">
          ${rows || renderEmpty(doneVideo ? '当前批次都已合成，已移动到过往记录。' : '当前批次没有文案')}
        </div>
        <details class="batch-history-fold">
          <summary>过往记录（默认折叠）</summary>
          <ul class="batch-history-list">
            ${historyRows || '<li>暂无已合成记录</li>'}
          </ul>
        </details>
        <details class="batch-path-fold batch-path-tip-note">
          <summary>路径说明（默认折叠，点击展开）</summary>
          <div class="batch-path-tip">
            <strong>视频素材放这里：</strong><code>${escapeHtml(folders.unusedDir)}</code>
            <span>可复用残片在 <code>${escapeHtml(folders.fragmentsDir)}</code>，用过素材在 <code>${escapeHtml(folders.usedDir)}</code>。</span>
            <span>所有成片统一导出到 <code>${escapeHtml(folders.unifiedExportDir || defaultMaterialFolders.unifiedExportDir)}</code>。</span>
          </div>
        </details>
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
      ${renderFlowStep('3', '字幕校对确认', '生成音频后先检查字幕文字、标题时长和位置。')}
      ${renderFlowStep('4', '音频结合视频', '匹配未使用素材，生成带标题和字幕的视频。')}
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
        <h2>生成后先确认字幕</h2>
        ${activeTask ? `
          <div class="asset-grid compact-assets">
            <div><span>音频</span><strong>${activeTask.audioStatus}</strong></div>
            <div><span>当前声音</span><strong>${escapeHtml(getVoiceName(activeTask.selectedVoiceId))}</strong></div>
            <div><span>语言</span><strong>${languageName(activeTask.language)}</strong></div>
            <div><span>字幕确认</span><strong>${activeTask.subtitleConfirmed ? '已确认' : '待确认'}</strong></div>
          </div>
          ${activeTask.audioUrl ? renderAudioPreview(activeTask.audioUrl) : ''}
          ${activeTask.audioStatus === '已生成' ? `
            <p class="hint">音频出来后，先去视频合成页看预览，再确认标题和字幕样式。</p>
            <div class="material-actions">
              <button class="soft" data-view="compose" type="button">去确认字幕样式</button>
              <button class="primary" data-confirm-task-subtitle="${activeTask.id}" type="button">直接确认这条字幕</button>
            </div>
          ` : ''}
        ` : renderEmpty('暂无任务')}
      </div>
    </section>
  `;
}

function renderSubtitleEditorPanel(task, confirmLabel = '确认单条字幕', options = {}) {
  const open = options.open ?? isSubtitleEditorOpen(task?.id, true);
  if (!task) return '';
  if (task.audioStatus !== '已生成' || !task.audioUrl) {
    return `
      <details class="panel subtitle-edit-fold" data-subtitle-fold-task="${task.id}" ${open ? 'open' : ''}>
        <summary>展开/收起字幕修改框</summary>
        <div class="subtitle-edit-card">
          <div class="panel-heading subtitle-edit-head">
            <div>
              <p class="eyebrow">文字校对</p>
              <h3>#${task.itemNumber} ${escapeHtml(task.title)}</h3>
            </div>
          </div>
          <p class="hint">这条任务还没生成音频。先生成音频，生成后就在这里直接修改字幕、查找替换并确认。</p>
          <div class="subtitle-status-row">
            <span>音频：${task.audioStatus}</span>
            <span>字幕确认：${task.subtitleConfirmed ? '已确认' : '待确认'}</span>
            <span>视频：${task.videoStatus}</span>
          </div>
        </div>
      </details>
    `;
  }
  return `
    <details class="panel subtitle-edit-fold" data-subtitle-fold-task="${task.id}" ${open ? 'open' : ''}>
      <summary>展开/收起字幕修改框</summary>
      <div class="subtitle-edit-card">
        <div class="panel-heading subtitle-edit-head">
          <div>
            <p class="eyebrow">文字校对</p>
            <h3>#${task.itemNumber} ${escapeHtml(task.title)}</h3>
          </div>
          <button class="primary" data-confirm-task-subtitle="${task.id}" type="button">${confirmLabel}</button>
        </div>
        ${renderAudioPreview(task.audioUrl)}
        <label>文字校对
          <textarea class="subtitle-editor" data-subtitle-text-task="${task.id}" placeholder="这里可以直接修改字幕文字">${escapeHtml(getTaskSubtitleText(task))}</textarea>
        </label>
        <div class="subtitle-replace-grid">
          <label>查找
            <input type="text" data-subtitle-find="${task.id}" placeholder="输入错别字" />
          </label>
          <label>替换成
            <input type="text" data-subtitle-replace="${task.id}" placeholder="输入正确词" />
          </label>
          <div class="subtitle-replace-actions">
            <button class="soft" data-replace-task-subtitle="${task.id}" type="button">替换当前整段</button>
            <button class="soft" data-remember-task-subtitle="${task.id}" type="button">记住</button>
          </div>
        </div>
        <div class="subtitle-status-row">
          <span>音频：${task.audioStatus}</span>
          <span>字幕确认：${task.subtitleConfirmed ? '已确认' : '待确认'}</span>
          <span>视频：${task.videoStatus}</span>
        </div>
      </div>
    </details>
  `;
}

function renderBatchSubtitleNavigator(tasks, activeTask) {
  if (!tasks.length || !activeTask) return '';
  const index = tasks.findIndex((task) => task.id === activeTask.id);
  const prev = index > 0 ? tasks[index - 1] : null;
  const next = index >= 0 && index < tasks.length - 1 ? tasks[index + 1] : null;
  return `
    <div class="batch-subtitle-nav">
      <span>当前第 ${index + 1} 条 / 共 ${tasks.length} 条</span>
      <div class="batch-subtitle-nav-actions">
        <button class="soft" type="button" ${prev ? `data-pick-task="${prev.id}" data-pick-view="batch"` : 'disabled'}>上一条</button>
        <button class="soft" type="button" ${next ? `data-pick-task="${next.id}" data-pick-view="batch"` : 'disabled'}>下一条</button>
      </div>
    </div>
  `;
}

function renderSubtitleWorkbench(activeTask) {
  const subtitleTasks = getProjectTasks().filter((task) => task.audioStatus === '已生成' && task.audioUrl);
  const subtitleTask = subtitleTasks.find((task) => task.id === activeTask?.id) || subtitleTasks[0] || null;
  const options = subtitleTasks.map((task) =>
    `<option value="${task.id}" ${subtitleTask?.id === task.id ? 'selected' : ''}>#${task.itemNumber} ${escapeHtml(task.title)}</option>`,
  ).join('');
  return `
    <section class="subtitle-shell">
      <div class="subtitle-left">
        <section class="panel">
          <p class="eyebrow">单条合成视频</p>
          <h2>文字校对与预览</h2>
          ${subtitleTask ? `
            <label>选择音频
              <select data-select-task="subtitle">
                ${options}
              </select>
            </label>
          ` : ''}
        </section>
        ${subtitleTask ? `
          <details class="panel subtitle-edit-fold" open>
            <summary>展开/收起字幕修改框</summary>
            <div class="subtitle-edit-card">
              <div class="panel-heading subtitle-edit-head">
                <div>
                  <p class="eyebrow">文字校对</p>
                  <h3>#${subtitleTask.itemNumber} ${escapeHtml(subtitleTask.title)}</h3>
                </div>
                <button class="primary" data-confirm-task-subtitle="${subtitleTask.id}" type="button">确认单条字幕</button>
              </div>
              ${renderAudioPreview(subtitleTask.audioUrl)}
              <label>文字校对
                <textarea class="subtitle-editor" data-subtitle-text-task="${subtitleTask.id}" placeholder="这里可以直接修改字幕文字">${escapeHtml(getTaskSubtitleText(subtitleTask))}</textarea>
              </label>
              <div class="subtitle-replace-grid">
                <label>查找
                  <input type="text" data-subtitle-find="${subtitleTask.id}" placeholder="输入错别字" />
                </label>
                <label>替换成
                  <input type="text" data-subtitle-replace="${subtitleTask.id}" placeholder="输入正确词" />
                </label>
                <div class="subtitle-replace-actions">
                  <button class="soft" data-replace-task-subtitle="${subtitleTask.id}" type="button">替换当前整段</button>
                  <button class="soft" data-remember-task-subtitle="${subtitleTask.id}" type="button">记住</button>
                </div>
              </div>
              <div class="subtitle-status-row">
                <span>音频：${subtitleTask.audioStatus}</span>
                <span>字幕确认：${subtitleTask.subtitleConfirmed ? '已确认' : '待确认'}</span>
                <span>视频：${subtitleTask.videoStatus}</span>
              </div>
            </div>
          </details>
          <section class="panel subtitle-preview-panel">
            <p class="eyebrow">待合成</p>
            <h2>先校对字幕，再去视频合成</h2>
            ${renderComposePreview(subtitleTask)}
          </section>
        ` : renderKitchenEmptyBridge('请先生成音频，再来校对字幕。')}
      </div>
      <div class="subtitle-right">
        <section class="panel">
          <p class="eyebrow">待合成列表</p>
          <h2>全局字幕修改会直接影响后续合成</h2>
          ${subtitleTasks.length ? renderTaskPicker('subtitle', subtitleTasks, subtitleTask, '暂无可校对字幕') : renderEmpty('请先生成音频，再来校对字幕。')}
        </section>
        <section class="panel">
          <p class="eyebrow">校对提醒</p>
          <h2>这一步是全局生效的</h2>
          <div class="subtitle-chip-list">
            <span class="subtitle-quick-chip">猛火照 → 猛火灶</span>
            <span class="subtitle-quick-chip">蒸反车 → 蒸饭车</span>
            <span class="subtitle-quick-chip">不秀钢 → 不锈钢</span>
          </div>
          <p class="hint">你在这里改的字幕文字，会同步用于单条和批量的后续视频合成。</p>
        </section>
      </div>
    </section>
  `;
}

function renderCompose(activeTask) {
  const audioTasks = getSingleProjectTasks().filter((task) => task.audioStatus === '已生成');
  const composeTask = audioTasks.find((task) => task.id === activeTask?.id) || audioTasks[0] || null;
  const options = audioTasks.map((task) =>
    `<option value="${task.id}" ${composeTask?.id === task.id ? 'selected' : ''}>#${task.itemNumber} ${escapeHtml(task.title)}</option>`,
  ).join('');
  return `
    <section class="compose-main-right">
      <div class="panel compose-mid-panel">
        <p class="eyebrow">视频合成</p>
        <h2>中间操作区</h2>
        ${renderKitchenConfigPanel('compose')}
        ${composeTask ? `
          <label>选择音频
            <select data-select-task="compose">
              ${options}
            </select>
          </label>
          <div class="compact-status-line">
            <strong>${composeTask.status}</strong>
          </div>
          <p class="hint">${composeTask.subtitleConfirmed ? '可直接合成。' : '先确认标题和字幕样式。'}</p>
          <div class="asset-grid compact-assets">
            <div><span>音频</span><strong>${composeTask.audioStatus}</strong></div>
            <div><span>字幕确认</span><strong>${composeTask.subtitleConfirmed ? '已确认' : '待确认'}</strong></div>
            <div><span>视频</span><strong>${composeTask.videoStatus}</strong></div>
          </div>
          <div class="material-actions">
            <button class="soft" data-view="audio" type="button">生成音频</button>
            <button class="soft" data-grab-frame="${composeTask.id}">仅抓取首帧</button>
            <button class="${composeTask.subtitleConfirmed ? 'soft' : 'primary'}" data-confirm-task-subtitle="${composeTask.id}" type="button">确认标题和字幕样式</button>
            <button class="primary" data-compose-video="${composeTask.id}">合成视频</button>
          </div>
        ` : renderKitchenEmptyBridge('请先上传文案并生成音频。')}
        ${composeTask ? renderSubtitleEditorPanel(composeTask, composeTask.subtitleConfirmed ? '重新确认单条字幕' : '确认单条字幕') : ''}
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
  const statusText = (task) => {
    if (view === 'subtitle') return task.subtitleConfirmed ? '已确认' : '待确认';
    return view === 'audio' ? task.status : '可合成';
  };
  return `
    <div class="picker-list">
      ${tasks.length ? tasks.map((task) => `
        <button class="picker-row ${activeTask?.id === task.id ? 'selected' : ''}" data-pick-task="${task.id}" data-pick-view="${view}">
          <span>
            <strong>${escapeHtml(task.title)}</strong>
            <small>${task.batchId} / ${task.itemNumber}</small>
          </span>
          <span class="status ${statusClass(statusText(task))}">${statusText(task)}</span>
        </button>
      `).join('') : renderEmpty(emptyText)}
    </div>
  `;
}

function renderInlineComposeRecords(activeTask) {
  const composeTasks = getSingleProjectTasks().filter((task) => task.audioStatus === '已生成');
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
        <span>${state.projectType === 'kitchen' ? '先导入厨具任务或在厨具项目里生成音频' : '暂无任务'}</span>
      </div>
    `;
  }

  const subtitleSource = previewSubtitleSample(getTaskSubtitleText(task));
  const titleLayout = layoutPreviewOverlayText(task.title || '', task.titleStyle?.size, 'title', 2, task.titleStyle?.width);
  const subtitleLayout = layoutPreviewOverlayText(subtitleSource, task.subtitleStyle?.size, 'subtitle', 1, task.subtitleStyle?.width);

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
          data-width="${task.titleStyle.width || 72}"
          style="left:${task.titleStyle.x}%; top:${task.titleStyle.y}%; width:${task.titleStyle.width || 72}%; color:${task.titleStyle.color}; font-size:${titleLayout.previewSize}px; text-shadow: 0 2px 8px ${task.titleStyle.shadowColor || '#000000'};"
        ><span class="resize-handle left" data-resize-edge="left"></span><span class="preview-text">${escapeHtml(titleLayout.text)}</span><span class="resize-handle right" data-resize-edge="right"></span></button>
        <button
          class="preview-subtitle"
          data-drag-target="subtitle"
          data-drag-task="${task.id}"
          data-x="${task.subtitleStyle.x}"
          data-y="${task.subtitleStyle.y}"
          data-width="${task.subtitleStyle.width || 72}"
          style="left:${task.subtitleStyle.x}%; top:${task.subtitleStyle.y}%; width:${task.subtitleStyle.width || 72}%; color:${task.subtitleStyle.color}; font-size:${subtitleLayout.previewSize}px;"
        ><span class="resize-handle left" data-resize-edge="left"></span><span class="preview-text">${escapeHtml(subtitleLayout.text)}</span><span class="resize-handle right" data-resize-edge="right"></span></button>
      </div>
      <div>
        <div class="style-grid">
          ${renderStyleControl(task, 'title', '标题', task.titleStyle)}
          ${renderStyleControl(task, 'subtitle', '字幕', task.subtitleStyle)}
        </div>
        ${titleLayout.truncated ? `<p class="hint log-error-text">提示：标题当前字号下已压到最多2行。</p>` : ''}
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
      <label class="style-row"><span class="style-label">颜色</span><span class="style-control"><input type="color" value="${style.color}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="color" /></span></label>
      ${target === 'title' ? `<label class="style-row"><span class="style-label">阴影颜色</span><span class="style-control"><input type="color" value="${style.shadowColor || '#000000'}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="shadowColor" /></span></label>` : ''}
      <label class="style-row"><span class="style-label">大小</span><span class="style-control"><input type="range" min="18" max="96" value="${style.size}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="size" /></span></label>
      <label class="style-row"><span class="style-label">边框宽度</span><span class="style-control"><input type="range" min="24" max="96" value="${style.width || 72}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="width" /></span></label>
      <label class="style-row"><span class="style-label">左右位置</span><span class="style-control"><input type="range" min="5" max="95" value="${style.x}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="x" /></span></label>
      <label class="style-row"><span class="style-label">上下位置</span><span class="style-control"><input type="range" min="5" max="95" value="${style.y}" data-style-task="${task.id}" data-style-target="${target}" data-style-key="y" /></span></label>
      ${target === 'title' ? `
        <label class="style-row">
          <span class="style-label">标题保留时长</span>
          <span class="style-control style-control-with-value">
            <input type="range" min="0" max="3" step="1" value="${holdIndex}" data-title-hold-task="${task.id}" />
            <small>${task.titleHold === 'always' ? '一直显示' : `${task.titleHold}s`}</small>
          </span>
        </label>
      ` : ''}
    </div>
  `;
}

function renderMaterials() {
  const inventory = state.materialInventory || initialState.materialInventory;
  const currentProject = getCurrentProjectMeta();
  if (state.projectType === 'kitchen') {
    const config = getKitchenConfig();
    return `
      <section class="materials-layout">
        <div class="panel material-form">
          <p class="eyebrow">素材库</p>
          <h2>${currentProject.shortLabel}素材库</h2>
          <p class="warning">硬规则：每条成片都要从外场、航拍、仓库内部三个池子的可用素材里按比例截取，已用素材绝对不复用。</p>
          <div class="folder-list">
            <div><span>外场可用</span><strong>${escapeHtml(config.pools.outdoor.unusedDir)}</strong></div>
            <div><span>航拍可用</span><strong>${escapeHtml(config.pools.aerial.unusedDir)}</strong></div>
            <div><span>仓库可用</span><strong>${escapeHtml(config.pools.warehouse.unusedDir)}</strong></div>
          </div>
          <p class="hint">合成时会优先从各池的可用素材截取；可用时长不够时才会继续检查对应池的残片素材。</p>
          <div class="material-actions">
            <button class="primary" data-refresh-materials="true">刷新素材统计</button>
            <button class="soft" data-init-materials="true">一键创建并扫描</button>
          </div>
          <code class="command-code">本地一键执行，不需要复制命令</code>
          <small class="scan-time">最近扫描：${inventory.updatedAt || '尚未扫描'}</small>
        </div>
        <div class="material-columns">
          ${renderKitchenInventoryPanel(config.pools.outdoor.label || '外场', inventory.kitchen?.outdoor)}
          ${renderKitchenInventoryPanel(config.pools.aerial.label || '航拍', inventory.kitchen?.aerial)}
          ${renderKitchenInventoryPanel(config.pools.warehouse.label || '仓库内部', inventory.kitchen?.warehouse)}
        </div>
      </section>
    `;
  }
  return `
    <section class="materials-layout">
      <div class="panel material-form">
        <p class="eyebrow">素材库</p>
        <h2>${currentProject.shortLabel}素材库</h2>
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

function renderKitchenInventoryPanel(title, poolInventory = {}) {
  const unused = poolInventory.unused || createEmptyInventoryBucket();
  const fragments = poolInventory.fragments || createEmptyInventoryBucket();
  const used = poolInventory.used || createEmptyInventoryBucket();
  return `
    <div class="panel material-column">
      <h3>${title}</h3>
      ${renderInventoryColumn('可用', 'unused', unused)}
      ${renderInventoryColumn('残片', 'fragments', fragments)}
      ${renderInventoryColumn('已用', 'used', used)}
    </div>
  `;
}

function renderInventoryColumn(title, kind, bucket = { count: 0, totalDuration: 0, files: [] }) {
  return `
    <div class="panel material-column material-status-block">
      <h4>${title}</h4>
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
  document.querySelectorAll('[data-project-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const projectType = button.dataset.projectType === 'kitchen' ? 'kitchen' : 'waidan';
      const firstTask = getProjectTasks(projectType)[0] || null;
      setState({
        projectType,
        activeTaskId: firstTask?.id || null,
      });
    });
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
  document.querySelectorAll('[data-close-notice]').forEach((button) => {
    button.addEventListener('click', () => setState({ noticeMessage: '' }));
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
  document.querySelectorAll('[data-audio-param-task]').forEach((input) => {
    input.addEventListener('input', () => updateTaskAudioParam(input.dataset.audioParamTask, input.dataset.audioParamKey, input.value));
  });
  document.querySelectorAll('[data-confirm-audio-params]').forEach((button) => {
    button.addEventListener('click', () => confirmTaskAudioParams(button.dataset.confirmAudioParams));
  });
  document.querySelectorAll('[data-audio-param-fold-task]').forEach((details) => {
    details.addEventListener('toggle', () => toggleTaskAudioParamsPanel(details.dataset.audioParamFoldTask, details.open));
  });
  document.querySelectorAll('[data-batch-audio-param]').forEach((input) => {
    input.addEventListener('input', () => updateBatchAudioParam(input.dataset.batchAudioParam, input.value));
  });
  document.querySelectorAll('[data-confirm-batch-audio-params]').forEach((button) => {
    button.addEventListener('click', confirmBatchAudioParams);
  });
  document.querySelectorAll('[data-batch-audio-param-fold]').forEach((details) => {
    details.addEventListener('toggle', () => toggleBatchAudioParamsPanel(details.open));
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
  document.querySelectorAll('[data-create-batch-folders]').forEach((button) => {
    button.addEventListener('click', () => createBatchFolders(button.dataset.createBatchFolders));
  });
  document.querySelectorAll('[data-batch-grab-frame]').forEach((button) => {
    button.addEventListener('click', () => {
      const taskId = button.dataset.batchGrabFrame;
      if (taskId) grabMaterialFrame(taskId);
    });
  });
  document.querySelectorAll('[data-confirm-batch-subtitles]').forEach((button) => {
    button.addEventListener('click', () => confirmBatchSubtitles(button.dataset.confirmBatchSubtitles));
  });
  document.querySelectorAll('[data-confirm-task-subtitle]').forEach((button) => {
    button.addEventListener('click', () => confirmTaskSubtitle(button.dataset.confirmTaskSubtitle));
  });
  document.querySelectorAll('[data-subtitle-text-task]').forEach((textarea) => {
    textarea.addEventListener('change', () => updateTaskSubtitleText(textarea.dataset.subtitleTextTask, textarea.value));
  });
  document.querySelectorAll('[data-subtitle-fold-task]').forEach((details) => {
    details.addEventListener('toggle', () => setSubtitleEditorOpen(details.dataset.subtitleFoldTask, details.open));
  });
  document.querySelectorAll('[data-replace-task-subtitle]').forEach((button) => {
    button.addEventListener('click', () => replaceTaskSubtitle(button.dataset.replaceTaskSubtitle, true));
  });
  document.querySelectorAll('[data-remember-task-subtitle]').forEach((button) => {
    button.addEventListener('click', () => rememberTaskSubtitle(button.dataset.rememberTaskSubtitle));
  });
  document.querySelectorAll('[data-continue-batch-compose]').forEach((button) => {
    button.addEventListener('click', () => continueBatchCompose(button.dataset.continueBatchCompose));
  });
  document.querySelectorAll('[data-remove-batch]').forEach((button) => {
    button.addEventListener('click', () => removeBatchTasks(button.dataset.removeBatch));
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
  document.querySelectorAll('[data-kitchen-ratio]').forEach((input) => {
    input.addEventListener('input', () => updateKitchenRatio(input.dataset.kitchenRatio, input.value));
  });
  document.querySelectorAll('[data-kitchen-threshold]').forEach((input) => {
    input.addEventListener('input', () => updateKitchenFragmentThreshold(input.value));
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

function normalizeOverlayText(input) {
  return String(input || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitCueText(input, maxChars = 12) {
  const text = normalizeOverlayText(input);
  if (!text) return [];
  const pieces = text
    .split(/(?<=[。！？!?；;，,、])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const output = [];
  for (const piece of pieces.length ? pieces : [text]) {
    const chars = [...piece];
    if (chars.length <= maxChars) {
      output.push(piece);
      continue;
    }
    for (let cursor = 0; cursor < chars.length; cursor += maxChars) {
      output.push(chars.slice(cursor, cursor + maxChars).join('').trim());
    }
  }
  return output.filter(Boolean);
}

function previewSubtitleSample(input) {
  const text = normalizeOverlayText(input);
  if (!text) return '字幕预览文字';
  return splitCueText(text, 12)[0] || text.slice(0, 12);
}

function outputFontSizeFromStyle(sourceSize, target = 'subtitle') {
  const size = Number(sourceSize || (target === 'title' ? 64 : 42));
  const outputBase = Math.round(size * (1080 / 640));
  return target === 'title'
    ? Math.min(112, Math.max(26, outputBase))
    : Math.min(84, Math.max(24, outputBase));
}

function estimateColsForOverlay(text, outputSize, target = 'subtitle', widthPct = null) {
  const cleaned = normalizeOverlayText(text);
  if (!cleaned) return 1;
  const styleWidth = Number(widthPct);
  const maxWidthRatio = Number.isFinite(styleWidth)
    ? Math.max(0.24, Math.min(0.96, styleWidth / 100))
    : (target === 'title' ? 0.84 : 0.9);
  const safeRatio = target === 'title' ? 0.64 : 0.58;
  const maxWidthPx = 1080 * maxWidthRatio * safeRatio;
  const cjkCount = (cleaned.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const latinCount = Math.max(0, [...cleaned].length - cjkCount);
  const cjkWeight = cjkCount + latinCount * 0.62;
  const avgCharWidth = cjkWeight > 0 ? (cjkCount * 1 + latinCount * 0.62) / cjkWeight : 1;
  const unitPx = outputSize * avgCharWidth;
  const cols = Math.floor(maxWidthPx / Math.max(1, unitPx));
  return Math.max(target === 'title' ? 6 : 8, cols);
}

function fitTitleOutputSize(text, sourceSize, widthPct = null) {
  let outputSize = outputFontSizeFromStyle(sourceSize, 'title');
  const total = [...normalizeOverlayText(text)].length;
  while (outputSize > 26 && estimateColsForOverlay(text, outputSize, 'title', widthPct) * 2 < total) {
    outputSize -= 2;
  }
  return outputSize;
}

function wrapOverlayLikeOutput(input, sourceSize, target = 'subtitle', maxLines = target === 'subtitle' ? 1 : 2, widthPct = null) {
  const text = normalizeOverlayText(input);
  if (!text) return { text: '', truncated: false, outputSize: outputFontSizeFromStyle(sourceSize, target) };
  const outputSize = target === 'title'
    ? fitTitleOutputSize(text, sourceSize, widthPct)
    : outputFontSizeFromStyle(sourceSize, target);
  const maxCols = estimateColsForOverlay(text, outputSize, target, widthPct);
  const chars = [...text];
  const lines = [];
  let current = '';
  let truncated = false;
  let usedChars = 0;
  for (const ch of chars) {
    current += ch;
    usedChars += 1;
    if ([...current].length >= maxCols) {
      if (lines.length < maxLines - 1) {
        lines.push(current.trim());
        current = '';
      } else {
        lines.push(current.trim());
        truncated = usedChars < chars.length;
        current = '';
        break;
      }
    }
  }
  if (current && lines.length < maxLines) lines.push(current.trim());
  if (!lines.length) lines.push(text);
  let output = lines.slice(0, maxLines).join('\n');
  if (truncated && output.length > 1 && target !== 'title') output = `${output.slice(0, -1)}…`;
  if (truncated && target === 'title') {
    output = lines.concat(current ? [current.trim()] : []).join('\n');
  }
  return { text: output, truncated, outputSize };
}

function layoutPreviewOverlayText(input, sourceSize, target = 'subtitle', maxLines = target === 'subtitle' ? 1 : 2, widthPct = null) {
  const wrapped = wrapOverlayLikeOutput(input, sourceSize, target, maxLines, widthPct);
  const previewSize = Math.max(14, Math.round((wrapped.outputSize * 360) / 1080));
  return {
    text: wrapped.text,
    truncated: wrapped.truncated,
    previewSize,
  };
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

function renderAudioPreview(audioUrl) {
  const safeUrl = normalizeAudioUrl(audioUrl);
  if (!safeUrl) return '';
  return `
    <audio controls preload="metadata" src="${safeUrl}" style="width:100%;margin-top:8px;"></audio>
    <div class="inline-link-row"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">打开音频</a></div>
  `;
}

render();
loadMaterialInventory();
loadMaterialFolders();








