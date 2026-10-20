'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Loader2,
  Shirt,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Box,
  LayoutGrid,
  Download,
  Pencil,
  History,
  XCircle,
} from 'lucide-react';
import { TaskStatus } from '@/components/task-status/task-status';
import { MultiView3DViewer } from '@/components/viewer/multi-view-3d';
import { OutfitEditor, type LayoutCell, type LayoutPreset, applyPreset as applyEditorPreset } from '@/components/editor/outfit-editor';
import { generateItemListImage } from '@/lib/canvas/item-list';
import { exportOutfitImage } from '@/lib/canvas/export';
import { cacheImageUrl } from '@/lib/utils';
import type { OutfitWithGarments, GenerationPlan, GenerationRecord } from '@/types';

export default function OutfitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [outfit, setOutfit] = useState<OutfitWithGarments | null>(null);
  const [generations, setGenerations] = useState<GenerationRecord[]>([]);
  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [itemListDataUrl, setItemListDataUrl] = useState<string | null>(null);
  const [generatingItemList, setGeneratingItemList] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | '3d' | 'edit'>('grid');
  const [editorCells, setEditorCells] = useState<LayoutCell[]>([]);
  const [editorPreset, setEditorPreset] = useState<LayoutPreset>('2x2');
  const [exporting, setExporting] = useState(false);

  const fetchOutfit = useCallback(async () => {
    try {
      const res = await fetch(`/api/outfit/${id}`);
      if (res.ok) {
        const data = await res.json();
        setOutfit(data.outfit);
        setGenerations(data.generations || []);
      } else {
        router.push('/outfit');
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/outfit/generation-plans?purpose=outfit');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
        setSelectedPlanId((prev) => prev || data.plans?.[0]?.id || '');
      }
    } catch {
      // 方案拉取失败不阻塞页面
    }
  }, []);

  useEffect(() => {
    fetchOutfit();
    fetchPlans();
  }, [fetchOutfit, fetchPlans]);

  // Computed state
  const isCompleted = outfit?.status === 'completed';
  const isGenerating = outfit?.status === 'generating' || !!generateTaskId;
  const isDraft = outfit?.status === 'draft';
  const isFailed = outfit?.status === 'failed';

  const selectedGeneration = generations.find((g) => g.id === selectedGenerationId) || null;
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  // 展示用图片：优先取选中记录，否则用 outfit 最新字段
  const activeFront =
    selectedGeneration?.type === 'tryon' ? selectedGeneration.images[0] : outfit?.front_image_path;
  const activeSide =
    selectedGeneration?.type === 'tryon' ? selectedGeneration.images[1] : outfit?.side_image_path;
  const activeBack =
    selectedGeneration?.type === 'tryon' ? selectedGeneration.images[2] : outfit?.back_image_path;
  const activeSuite =
    selectedGeneration?.type === 'suite' ? selectedGeneration.images : outfit?.suite_image_paths || [];

  const hasAllViews = !!(activeFront && activeSide && activeBack);

  // Auto-refresh while generating
  useEffect(() => {
    if (!outfit || outfit.status !== 'generating') return;
    const timer = setInterval(fetchOutfit, 3000);
    return () => clearInterval(timer);
  }, [outfit, fetchOutfit]);

  const generateItemList = async () => {
    if (!outfit) return;
    setGeneratingItemList(true);
    try {
      const dataUrl = await generateItemListImage({
        outfitName: outfit.name,
        items: outfit.garments.map((g) => ({
          imageUrl: cacheImageUrl(g.image_path),
          name: g.name,
          category: g.category,
        })),
      });
      setItemListDataUrl(dataUrl);
    } catch (error) {
      console.error('Failed to generate item list:', error);
    } finally {
      setGeneratingItemList(false);
    }
  };

  // Generate item list image when front image is ready
  useEffect(() => {
    if (outfit?.status === 'completed' && activeFront && outfit.garments.length > 0 && !itemListDataUrl && !generatingItemList) {
      generateItemList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfit, activeFront]);

  // Initialize editor cells when active images change (切换生成记录时重新加载对应图片)
  useEffect(() => {
    if (isCompleted && hasAllViews && itemListDataUrl && outfit) {
      const rawCells: LayoutCell[] = [
        { id: 'front', label: '正面', imageSrc: cacheImageUrl(activeFront!), colSpan: 1, rowSpan: 1 },
        { id: 'itemlist', label: '单品清单', imageSrc: itemListDataUrl, colSpan: 1, rowSpan: 1 },
        { id: 'side', label: '侧面', imageSrc: cacheImageUrl(activeSide!), colSpan: 1, rowSpan: 1 },
        { id: 'back', label: '背面', imageSrc: cacheImageUrl(activeBack!), colSpan: 1, rowSpan: 1 },
      ];
      setEditorCells(applyEditorPreset(rawCells, editorPreset || '2x2'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleted, hasAllViews, itemListDataUrl, activeFront, activeSide, activeBack]);

  const handleGenerate = async () => {
    if (!outfit) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/outfit/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '生成失败');
      }
      const data = await res.json();
      setGenerateTaskId(data.taskId);
      // 开始新生成后，回到展示最新结果
      setSelectedGenerationId(null);
      await fetchOutfit();
    } catch (error) {
      alert(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateComplete = useCallback(async () => {
    setGenerateTaskId(null);
    await fetchOutfit();
  }, [fetchOutfit]);

  const handleExport = async () => {
    if (editorCells.length === 0) return;
    setExporting(true);
    try {
      await exportOutfitImage({
        cells: editorCells,
        preset: editorPreset,
        title: outfit?.name,
        showLabels: true,
        filename: outfit?.name || 'outfit',
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const handleCellsChange = (cells: LayoutCell[]) => {
    setEditorCells(cells);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="text-center py-12 text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!outfit) return null;

  return (
    <div className="max-w-5xl mx-auto">
      <Link href="/outfit" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> 返回穿搭方案列表
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{outfit.name}</h1>
              {isCompleted && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-600 text-xs font-medium rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> 已完成
                </span>
              )}
              {isGenerating && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs font-medium rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin" /> 生成中
                </span>
              )}
              {isDraft && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                  草稿
                </span>
              )}
              {isFailed && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">
                  <AlertCircle className="w-3 h-3" /> 失败
                </span>
              )}
            </div>
            {outfit.description && <p className="text-sm text-gray-500">{outfit.description}</p>}
            <p className="text-xs text-gray-400 mt-1">
              {outfit.garments.length} 件单品 · 创建于 {new Date(outfit.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isGenerating && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 启动中...</>
                ) : selectedPlan?.taskType === 'outfit_suite' ? (
                  <><Play className="w-4 h-4" /> 生成商品套图</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> 一键生成四图</>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 生成方案选择（厂商/模型/价格） */}
        {!isGenerating && (
          <div className="mt-5">
            <div className="text-xs font-medium text-gray-500 mb-2">选择生成方案</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    selectedPlanId === p.id
                      ? 'border-pink-500 bg-pink-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    <span className="text-xs font-semibold text-pink-600">{p.totalCost} 元/套</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {p.provider} · {p.model}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.price} 元/次 × {p.calls} 次 · {p.imagesPerCall * p.calls} 张
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Garments preview */}
        <div className="mt-4 flex gap-2 flex-wrap">
          {outfit.garments.map((g) => (
            <div key={g.id} className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg">
              <img src={cacheImageUrl(g.image_path)} alt={g.name} className="w-8 h-8 rounded object-cover" />
              <span className="text-xs text-gray-600">{g.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Generation task status */}
      {generateTaskId && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">生成进度</h2>
          <TaskStatus taskId={generateTaskId} onComplete={handleGenerateComplete} />
        </div>
      )}

      {/* No task running and not completed */}
      {!generateTaskId && isDraft && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shirt className="w-8 h-8 text-pink-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">准备生成</h2>
          <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
            在上方选择生成方案：模特试衣生成正面、侧面、背面三张穿搭图；商品套图由 AI 一次生成多张商品海报（0.79 元/次）。
          </p>
          <div className="text-xs text-gray-400">预计耗时 1-3 分钟</div>
        </div>
      )}

      {/* 生成历史记录（永久保留，含厂商/模型/费用） */}
      {generations.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">生成记录</h2>
            <span className="text-xs text-gray-400">{generations.length} 条</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {generations.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGenerationId(g.id)}
                className={`text-left rounded-xl border overflow-hidden transition-colors ${
                  selectedGenerationId === g.id
                    ? 'border-pink-500 ring-2 ring-pink-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="relative aspect-square bg-gray-50">
                  {g.images[0] ? (
                    <img src={cacheImageUrl(g.images[0])} alt={g.model} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {g.status === 'failed' ? (
                        <XCircle className="w-6 h-6 text-red-300" />
                      ) : (
                        <Shirt className="w-6 h-6 text-gray-200" />
                      )}
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
                    {g.type === 'tryon' ? '模特试衣' : '商品套图'}
                  </div>
                  {g.status === 'failed' && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">失败</div>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="text-xs font-medium text-gray-800 truncate" title={g.model}>
                    {g.model}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{g.provider} · {g.total_cost} 元</div>
                  <div className="text-xs text-gray-400 mt-0.5">{g.images.length} 张 · {new Date(g.created_at).toLocaleString()}</div>
                </div>
              </button>
            ))}
          </div>
          {selectedGeneration && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                正在查看「{selectedGeneration.type === 'tryon' ? '模特试衣' : '商品套图'}」记录：
                {selectedGeneration.provider} · {selectedGeneration.model} · 费用 {selectedGeneration.total_cost} 元 · {new Date(selectedGeneration.created_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI 商品套图结果 */}
      {activeSuite.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">AI 商品套图</h2>
            <span className="text-xs text-gray-400">{activeSuite.length} 张</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activeSuite.map((url, index) => (
              <div key={url} className="relative aspect-[3/4] bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                <img src={cacheImageUrl(url)} alt={`商品套图 ${index + 1}`} className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
                  套图 {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Four-grid layout when completed */}
      {isCompleted && hasAllViews && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {viewMode === 'grid' ? '四图排版方案' : viewMode === 'edit' ? '编辑排版' : '3D旋转查看'}
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white text-pink-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> 预览
                </button>
                <button
                  onClick={() => setViewMode('edit')}
                  className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'edit'
                      ? 'bg-white text-purple-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" /> 编辑
                </button>
                <button
                  onClick={() => setViewMode('3d')}
                  className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === '3d'
                      ? 'bg-white text-green-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" /> 3D
                </button>
              </div>
              {viewMode === 'edit' && itemListDataUrl && (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  导出图片
                </button>
              )}
            </div>
          </div>

          {viewMode === 'grid' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative aspect-[3/4] bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                  <img src={cacheImageUrl(activeFront!)} alt="正面" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">正面</div>
                </div>

                <div className="relative aspect-[3/4] bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                  {itemListDataUrl ? (
                    <img src={itemListDataUrl} alt="单品清单" className="w-full h-full object-cover" />
                  ) : generatingItemList ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                    </div>
                  ) : (
                    <button
                      onClick={generateItemList}
                      className="w-full h-full flex flex-col items-center justify-center text-gray-400 hover:text-pink-500 transition-colors"
                    >
                      <Shirt className="w-8 h-8 mb-2" />
                      <span className="text-sm">点击生成单品清单</span>
                    </button>
                  )}
                  {itemListDataUrl && (
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">单品清单</div>
                  )}
                </div>

                <div className="relative aspect-[3/4] bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                  <img src={cacheImageUrl(activeSide!)} alt="侧面" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">侧面</div>
                </div>

                <div className="relative aspect-[3/4] bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                  <img src={cacheImageUrl(activeBack!)} alt="背面" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">背面</div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-pink-50 rounded-lg">
                <p className="text-xs text-pink-700">
                  <strong>提示：</strong>切换到「编辑」模式可拖拽调整排版，支持多种布局预设并导出高清图片。
                </p>
              </div>
            </>
          ) : viewMode === 'edit' ? (
            <>
              {itemListDataUrl && editorCells.length > 0 ? (
                <OutfitEditor
                  cells={editorCells}
                  onCellsChange={handleCellsChange}
                  preset={editorPreset}
                  onPresetChange={setEditorPreset}
                  showLabels={true}
                  readonly={false}
                />
              ) : generatingItemList ? (
                <div className="py-20 text-center">
                  <Loader2 className="w-8 h-8 text-pink-400 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">正在生成单品清单...</p>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Shirt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 mb-3">请先生成单品清单图</p>
                  <button
                    onClick={generateItemList}
                    className="px-4 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 transition-colors"
                  >
                    生成单品清单
                  </button>
                </div>
              )}
              <div className="mt-4 p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-purple-700">
                  <strong>编辑模式：</strong>拖拽图片调整顺序，选择不同排版预设（2×2/左大图/上大图），调整满意后点击「导出图片」下载高清排版图（2K分辨率）。
                </p>
              </div>
            </>
          ) : (
            <div>
              <MultiView3DViewer
                frontImage={activeFront!}
                sideImage={activeSide}
                backImage={activeBack}
                autoRotate={true}
                height={480}
              />
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-700">
                  <strong>提示：</strong>拖拽旋转查看3D效果，支持自动旋转、手动拖拽、按钮切换视角。
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {isCompleted && !hasAllViews && (activeFront || activeSide || activeBack) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">生成结果</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {activeFront && (
              <div><img src={cacheImageUrl(activeFront)} alt="正面" className="w-full rounded-xl border" /><p className="text-center text-sm text-gray-500 mt-2">正面</p></div>
            )}
            {activeSide && (
              <div><img src={cacheImageUrl(activeSide)} alt="侧面" className="w-full rounded-xl border" /><p className="text-center text-sm text-gray-500 mt-2">侧面</p></div>
            )}
            {activeBack && (
              <div><img src={cacheImageUrl(activeBack)} alt="背面" className="w-full rounded-xl border" /><p className="text-center text-sm text-gray-500 mt-2">背面</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
