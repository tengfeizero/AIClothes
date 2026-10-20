'use client';

import { useEffect, useState, useRef } from 'react';
import { ListChecks, Clock, CheckCircle, XCircle, Loader2, ExternalLink, Image as ImageIcon, Shirt, Sparkles, CalendarDays, LayoutGrid, Rotate3D, X, Trash2, RotateCw, RefreshCw, WandSparkles } from 'lucide-react';
import Link from 'next/link';
import { cacheImageUrl } from '@/lib/utils';

interface TaskItem {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error: string | null;
  result: { images?: string[]; outfitId?: string; taskType?: string; glbUrl?: string; previewUrl?: string } | null;
  created_at: number;
  completed_at: number | null;
  params: Record<string, unknown>;
}

const typeLabels: Record<string, { name: string; icon: typeof Shirt; color: string }> = {
  tryon: { name: 'AI换装', icon: Shirt, color: 'text-blue-600 bg-blue-50' },
  replicate: { name: '爆款复刻', icon: Sparkles, color: 'text-orange-600 bg-orange-50' },
  multi_view: { name: '多视角生成', icon: ImageIcon, color: 'text-green-600 bg-green-50' },
  outfit_batch: { name: '穿搭方案', icon: CalendarDays, color: 'text-pink-600 bg-pink-50' },
  outfit_suite: { name: '商品套图', icon: LayoutGrid, color: 'text-purple-600 bg-purple-50' },
  model3d: { name: '3D商品', icon: Rotate3D, color: 'text-indigo-600 bg-indigo-50' },
  generate: { name: '自由生图', icon: ImageIcon, color: 'text-cyan-600 bg-cyan-50' },
  edit: { name: 'AI编辑', icon: WandSparkles, color: 'text-emerald-600 bg-emerald-50' },
};

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', label: '排队中' },
  processing: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50', label: '生成中' },
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', label: '已完成' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: '失败' },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // 3D 模型查看弹窗（model3d 任务）
  const [viewModel, setViewModel] = useState<{ glbUrl: string; previewUrl?: string } | null>(null);
  const [modelViewerReady, setModelViewerReady] = useState(false);
  // 模特 id → 模特图（用于任务里只有 modelId 时补全输入模特图）
  const [modelImages, setModelImages] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [counts, setCounts] = useState({ all: 0, processing: 0, completed: 0, failed: 0 });

  // 模型图片懒加载：任务列表渲染后再异步获取，不阻塞首屏
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/model')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.models) return;
          const map: Record<string, string> = {};
          for (const m of data.models as Array<{ id: string; identity_image_path?: string }>) {
            if (m.id && m.identity_image_path) map[m.id] = m.identity_image_path;
          }
          setModelImages(map);
        })
        .catch(() => undefined);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // 打开 3D 模型弹窗时按需加载 model-viewer 脚本
  useEffect(() => {
    if (!viewModel || modelViewerReady) return;
    if ((window as unknown as { ModelViewer?: unknown }).ModelViewer) {
      setModelViewerReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
    script.async = true;
    script.onload = () => setModelViewerReady(true);
    document.head.appendChild(script);
  }, [viewModel, modelViewerReady]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let hasProcessing = false;

    const fetchTasks = async () => {
      try {
        const res = await fetch(`/api/tasks?page=${page}&pageSize=${pageSize}`);
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          const taskList = (data.tasks || []).filter((t: TaskItem) => !deletedIdsRef.current.has(t.id));
          setTasks(taskList);
          if (data.total !== undefined) setTotal(data.total);
          if (data.totalPages !== undefined) setTotalPages(data.totalPages);
          if (data.counts) setCounts(data.counts);
          const nowProcessing = taskList.some(
            (t: TaskItem) => t.status === 'pending' || t.status === 'processing'
          );
          if (nowProcessing !== hasProcessing && timer) {
            hasProcessing = nowProcessing;
            clearInterval(timer);
            timer = setInterval(fetchTasks, hasProcessing ? 2000 : 5000);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTasks();
    timer = setInterval(fetchTasks, 5000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [page, pageSize]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'processing') return t.status === 'pending' || t.status === 'processing';
    return t.status === filter;
  });

  const handleRetry = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'PATCH' });
      if (res.ok) {
        setTasks((prev) => prev.map((t) =>
          t.id === taskId ? { ...t, status: 'pending' as const, progress: 0, error: null } : t
        ));
      }
    } catch {
      // ignore
    }
  };

  // 手动向厂商查询失败任务的真实状态并恢复（不重新提交，不会重复计费）
  const handleReconcile = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/reconcile`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
        }
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/tasks/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        deletedIdsRef.current.add(deleteId);
        setTasks((prev) => prev.filter((t) => t.id !== deleteId));
        setTotal((prev) => prev - 1);
      }
    } catch {
      // ignore
    }
    setDeleteId(null);
  };

  const displayCounts = {
    all: counts.all || tasks.length,
    processing: counts.processing,
    completed: counts.completed,
    failed: counts.failed,
  };

  const getResultLink = (task: TaskItem): { href: string; label: string } | null => {
    if ((task.type === 'outfit_batch' || task.type === 'outfit_suite') && task.result?.outfitId) {
      return { href: `/outfit/${task.result.outfitId}`, label: '查看方案' };
    }
    return null;
  };

  const getResultThumb = (task: TaskItem): string | null => {
    // 3D 任务优先展示生成预览图
    if (task.type === 'model3d') return task.result?.previewUrl || null;
    return task.result?.images?.[0] || null;
  };

  // 从任务参数提取展示信息（tryon/replicate 用 providerName，outfit 用 provider；提示词字段不统一）
  const getTaskMeta = (task: TaskItem) => {
    const p = task.params || {};

    const inputImages: string[] = [];
    // 穿搭方案：存在"整套单品拼图"（garmentCollageUrl）时，不再展示提交时选的单品原图，
    // 输入图保持为「拼图 + 模特图」两张
    const hasCollage = typeof p.garmentCollageUrl === 'string' && !!p.garmentCollageUrl;
    if (!hasCollage && typeof p.garmentImagePath === 'string' && p.garmentImagePath) inputImages.push(p.garmentImagePath);
    if (typeof p.referenceImagePath === 'string' && p.referenceImagePath) inputImages.push(p.referenceImagePath);
    if (typeof p.poseImagePath === 'string' && p.poseImagePath) inputImages.push(p.poseImagePath);
    if (typeof p.backgroundImagePath === 'string' && p.backgroundImagePath) inputImages.push(p.backgroundImagePath);
    if (typeof p.garmentCollageUrl === 'string' && p.garmentCollageUrl) inputImages.push(p.garmentCollageUrl);
    if (Array.isArray(p.garmentImagePaths)) inputImages.push(...(p.garmentImagePaths as string[]));
    if (Array.isArray(p.imagePaths)) inputImages.push(...(p.imagePaths as string[]));
    if (typeof p.inputUrl === 'string' && p.inputUrl) inputImages.push(p.inputUrl);
    if (typeof p.modelImagePath === 'string' && p.modelImagePath) inputImages.push(p.modelImagePath);
    // 3D 任务：多视角输入图
    if (Array.isArray(p.imageUrls)) inputImages.push(...(p.imageUrls as string[]));
    // 只有 modelId 的任务（如混元换装），用模特库映射补全输入模特图
    if (typeof p.modelId === 'string' && p.modelId && modelImages[p.modelId]) {
      inputImages.push(modelImages[p.modelId]);
    }
    // 同一张图可能同时作为姿势图/背景图/参考图，按 URL 去重
    const uniqueImages = [...new Set(inputImages)];

    const prompt =
      (typeof p.fullPrompt === 'string' && p.fullPrompt) ||
      (typeof p.backgroundPrompt === 'string' && p.backgroundPrompt) ||
      (typeof p.scenePrompt === 'string' && p.scenePrompt) ||
      '';

    const provider =
      (typeof p.providerName === 'string' && p.providerName) ||
      (typeof p.provider === 'string' && p.provider) ||
      '';

    const model = typeof p.model === 'string' ? p.model : '';
    const price = typeof p.price === 'number' ? p.price : 0;
    const calls = typeof p.calls === 'number' && p.calls > 0 ? p.calls : 1;
    const cost = price * calls;

    return { inputImages: uniqueImages, prompt, provider, model, price, calls, cost };
  };

  return (
    <div className="max-w-5xl mx-auto p-4 pb-24">
      {/* Filter tabs */}
      {!loading && tasks.length > 0 && (
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          {[
            { key: 'all' as const, label: '全部', count: displayCounts.all },
            { key: 'processing' as const, label: '进行中', count: displayCounts.processing },
            { key: 'completed' as const, label: '已完成', count: displayCounts.completed },
            { key: 'failed' as const, label: '失败', count: displayCounts.failed },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                filter === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  tab.key === 'processing' ? 'bg-blue-100 text-blue-600' :
                  tab.key === 'failed' ? 'bg-red-100 text-red-600' :
                  tab.key === 'completed' ? 'bg-green-100 text-green-600' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
                <div className="w-16 h-6 bg-gray-200 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListChecks className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">暂无任务</h2>
          <p className="text-gray-500 text-sm mb-4">去AI换装页面开始你的第一次生成吧</p>
          <div className="flex gap-2 justify-center">
            <Link
              href="/tryon"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <Shirt className="w-4 h-4" /> AI换装
            </Link>
            <Link
              href="/replicate"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <Sparkles className="w-4 h-4" /> 爆款复刻
            </Link>
          </div>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-400">
          该分类下暂无任务
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredTasks.map((task) => {
            const cfg = statusConfig[task.status];
            const StatusIcon = cfg.icon;
            const typeCfg = typeLabels[task.type] || { name: task.type, icon: ImageIcon, color: 'text-gray-600 bg-gray-50' };
            const TypeIcon = typeCfg.icon;
            const resultLink = getResultLink(task);
            const thumb = getResultThumb(task);
            const meta = getTaskMeta(task);

            return (
              <div key={task.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start gap-3">
                  {/* Thumbnail or type icon */}
                  <div className="flex-shrink-0">
                    {thumb ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(thumb)}
                        className="cursor-zoom-in"
                        title="点击查看大图"
                      >
                        <img src={cacheImageUrl(thumb)} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200 hover:opacity-90 transition-opacity" />
                      </button>
                    ) : (
                      <div className={`w-14 h-14 rounded-lg ${typeCfg.color.split(' ')[1]} flex items-center justify-center`}>
                        <TypeIcon className={`w-6 h-6 ${typeCfg.color.split(' ')[0]}`} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{typeCfg.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} flex items-center gap-1`}>
                        <StatusIcon className={`w-3 h-3 ${task.status === 'processing' ? 'animate-spin' : ''}`} />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatTime(task.created_at)}
                    </div>
                    {task.status === 'processing' && (
                      <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}
                    {task.error && (
                      <p className="text-xs text-red-500 mt-1">{task.error}</p>
                    )}

                    {/* 任务详情：输入图片 / 提示词 / 厂商 / 模型 / 费用 */}
                    {(meta.inputImages.length > 0 || meta.prompt || meta.provider || meta.model) && (
                      <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1.5">
                        {meta.inputImages.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-[11px] text-gray-400 w-14 flex-shrink-0 leading-5">输入图片</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {meta.inputImages.map((img, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setPreviewImage(img)}
                                  className="cursor-zoom-in"
                                  title="点击查看大图"
                                >
                                  <img
                                    src={cacheImageUrl(img)}
                                    alt=""
                                    className="w-10 h-10 rounded object-cover border border-gray-200 hover:opacity-90 transition-opacity"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {meta.prompt && (
                          <div className="flex items-start gap-2">
                            <span className="text-[11px] text-gray-400 w-14 flex-shrink-0 leading-5">提示词</span>
                            <p className="text-xs text-gray-600 leading-5 flex-1 min-w-0 whitespace-pre-wrap">{meta.prompt}</p>
                          </div>
                        )}
                        {(meta.provider || meta.model || meta.cost > 0) && (
                          <div className="flex items-start gap-2">
                            <span className="text-[11px] text-gray-400 w-14 flex-shrink-0 leading-5">方案</span>
                            <p className="text-xs text-gray-600 leading-5 flex-1 min-w-0">
                              {[meta.provider, meta.model].filter(Boolean).join(' · ')}
                              {meta.cost > 0 && (
                                <span className="text-gray-900 font-medium">
                                  {' · '}{meta.calls > 1 ? `${meta.price}×${meta.calls} = ` : ''}{meta.cost} 元
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                        {Array.isArray(task.result?.images) && task.result.images.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-[11px] text-gray-400 w-14 flex-shrink-0 leading-5">输出图片</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {task.result.images.map((img, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setPreviewImage(img)}
                                  className="cursor-zoom-in"
                                  title="点击查看大图"
                                >
                                  <img
                                    src={cacheImageUrl(img)}
                                    alt=""
                                    className="w-10 h-10 rounded object-cover border border-gray-200 hover:opacity-90 transition-opacity"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex gap-1">
                    {task.type === 'model3d' && task.status === 'completed' && task.result?.glbUrl && (
                      <button
                        type="button"
                        onClick={() => setViewModel({ glbUrl: task.result!.glbUrl!, previewUrl: task.result?.previewUrl })}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      >
                        <Rotate3D className="w-3.5 h-3.5" /> 查看3D
                      </button>
                    )}
                    {resultLink && (
                      <Link
                        href={resultLink.href}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> {resultLink.label}
                      </Link>
                    )}
                    {task.status === 'failed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleReconcile(task.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          title="向厂商查询任务真实状态并恢复，不会重复计费"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> 查询恢复
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRetry(task.id)}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="重新提交生成（可能再次计费）"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteId(task.id)}
                      className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除任务"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-100 col-span-full">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[5, 10, 20, 40, 80].map((s) => (
                    <option key={s} value={s}>{s} 条</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400">共 {total} 条</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setPage(pageNum)}
                      className={`w-7 h-7 text-xs font-medium rounded-lg transition-colors ${
                        page === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 overflow-auto flex"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 hover:bg-white text-gray-900 rounded-full flex items-center justify-center transition-colors shadow-lg"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={cacheImageUrl(previewImage)}
            alt="预览大图"
            className="m-auto rounded-xl shadow-2xl max-w-none max-h-none"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {/* 3D 模型查看弹窗 */}
      {viewModel && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewModel(null)}
        >
          <button
            type="button"
            onClick={() => setViewModel(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="w-full max-w-3xl bg-gray-900 rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-b from-gray-800 to-gray-900">
              {modelViewerReady ? (
                <model-viewer
                  src={viewModel.glbUrl}
                  poster={viewModel.previewUrl ? cacheImageUrl(viewModel.previewUrl) : undefined}
                  alt="商品 3D 模型"
                  camera-controls
                  auto-rotate
                  rotation-per-second="24deg"
                  shadow-intensity="1"
                  shadow-softness="0.8"
                  exposure="1"
                  style={{ width: '100%', height: 480 }}
                />
              ) : (
                <div className="w-full h-96 flex flex-col items-center justify-center gap-3 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-sm">正在加载 3D 查看器...</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Rotate3D className="w-3.5 h-3.5" />
                拖拽旋转 · 滚轮缩放
              </p>
              <a
                href={viewModel.glbUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 下载 GLB
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 text-center shadow-xl">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">确认删除</h3>
            <p className="text-sm text-gray-500 mb-5">删除后不可恢复，确定要删除该任务？</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
